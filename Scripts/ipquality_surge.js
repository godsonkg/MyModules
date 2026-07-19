/**
 * 节点 IP 质量检测 · Surge 自包含脚本
 *
 * 说明：
 *   之前的版本依赖“下载上游 Loon 脚本并用正则改写后 eval”的方式，
 *   上游结构一变就整个失效，因此在 Surge 上一直跑不起来。
 *   本版本改为完全自包含：不再依赖任何第三方脚本，直接用 Surge 的
 *   $httpClient（支持 policy 指定出口策略）完成全部检测。
 *
 * 检测内容：
 *   1. 指定节点/策略组的真实出口 IP、归属地、机房、WARP 状态
 *   2. IP 类型（住宅/数据中心/移动/代理）与风险评估、纯净度评分
 *   3. 流媒体可用性（Netflix / YouTube / Disney+）——连通性级别检测
 *   4. AI 可用性（ChatGPT / Claude / Gemini）——连通性 + 地区限制关键字
 *
 * 参数（在模块中通过 argument 传入，以 & 分隔）：
 *   policy=节点或策略组名称（必填，需与 Surge 中完全一致）
 *   media=true|false        是否检测流媒体/AI（默认 true）
 *   mask=true|false         是否对出口 IP 打码（默认 false）
 *
 * 运行：Surge「脚本」页 → 长按“节点 IP 质量检测”→ 运行。
 */

const SCRIPT_VERSION = "2026-07-19.s5";

(async () => {
  const options = parseArguments(typeof $argument === "string" ? $argument : "");
  const POLICY = clean(options.policy) || "PROXY";
  const MEDIA = readBoolean(options.media, true);
  const MASK = readBoolean(options.mask, false);
  const TIMEOUT = 8000;

  console.log(`[INFO] IPQuality self-contained ${SCRIPT_VERSION} / policy=${POLICY}`);

  // —— 通用 HTTP —— //
  function httpGet(opts) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), opts.timeout || TIMEOUT);
      $httpClient.get(opts, (error, response, body) => {
        clearTimeout(timer);
        if (error) { reject(new Error(String(error))); return; }
        resolve({
          status: (response && (response.status || response.statusCode)) || 0,
          headers: (response && response.headers) || {},
          body: body || "",
        });
      });
    });
  }

  // 经指定策略请求（用于检测该节点出口）
  function viaPolicy(url, extraHeaders) {
    return httpGet({
      url,
      policy: POLICY,
      timeout: TIMEOUT,
      headers: Object.assign({ "User-Agent": "Mozilla/5.0" }, extraHeaders || {}),
    });
  }

  // —— 工具函数 —— //
  function getFlag(cc) {
    if (!cc || cc.length !== 2) return "";
    return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) + " ";
  }

  function parseTrace(body) {
    const data = {};
    String(body || "").split("\n").forEach(line => {
      const i = line.indexOf("=");
      if (i > -1) {
        const key = line.slice(0, i).trim();
        if (key) data[key] = line.slice(i + 1).trim();
      }
    });
    return data;
  }

  function shorten(text, max) {
    if (!text) return "—";
    const s = String(text);
    return s.length <= max ? s : s.slice(0, max - 1) + "…";
  }

  function maskIP(ip) {
    if (!ip || !MASK) return ip || "—";
    if (ip.indexOf(":") > -1) { // IPv6
      const parts = ip.split(":");
      return parts.length > 2 ? `${parts[0]}:${parts[1]}:****` : "****";
    }
    const p = ip.split(".");
    return p.length === 4 ? `${p[0]}.${p[1]}.*.*` : ip;
  }

  const DC_RE = new RegExp([
    "google", "aws", "amazon", "azure", "microsoft", "cloudflare", "alibaba", "tencent",
    "digitalocean", "linode", "vultr", "oracle", "ovh", "hetzner", "contabo", "leaseweb",
    "serverius", "choopa", "psychz", "multacom", "zenlayer", "cogent", "lumen", "hurricane",
    "he\\.net", "buyvm", "frantech", "quadranet", "reliablesite", "sharktech", "steadfast",
    "nexeon", "hostwinds", "datacamp", "m247", "servers\\.com",
  ].join("|"), "i");

  function detectIpQuality(d) {
    const text = `${d.isp || ""} ${d.org || ""} ${d.as || ""}`;
    if (d.mobile) return { type: "📱 移动网络", risk: "低 ✅", score: 85 };
    if (d.proxy) return { type: "🔀 代理/VPN", risk: "高 ⚠️", score: 30 };
    if (d.hosting || DC_RE.test(text)) return { type: "🏢 数据中心", risk: "中 ⚡", score: 45 };
    return { type: "🏠 住宅宽带", risk: "低 ✅", score: 95 };
  }

  // —— 1. 出口 IP（经策略拿 cdn-cgi/trace） —— //
  async function getEgress() {
    const endpoints = [
      "https://www.cloudflare.com/cdn-cgi/trace",
      "https://chatgpt.com/cdn-cgi/trace",
      "https://cloudflare.com/cdn-cgi/trace",
    ];
    for (const url of endpoints) {
      try {
        const res = await viaPolicy(url);
        if (res.status >= 200 && res.status < 400) {
          const t = parseTrace(res.body);
          if (t.ip) return t;
        }
      } catch (_) { /* 换下一个 */ }
    }
    return null;
  }

  // —— 2. IP 质量（ip-api.com，直连查询，传入 IP 即可） —— //
  async function queryIpQuality(ip) {
    const fields = ["status", "message", "query", "country", "countryCode", "regionName",
      "city", "isp", "org", "as", "proxy", "hosting", "mobile"].join(",");
    const res = await httpGet({
      url: `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=${fields}`,
      timeout: TIMEOUT,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const d = JSON.parse(res.body || "{}");
    if (!d || d.status === "fail") throw new Error(d && d.message ? d.message : "ip-api fail");
    return d;
  }

  // —— 3. 流媒体（连通性级别，经策略） —— //
  async function checkNetflix() {
    try {
      const res = await viaPolicy("https://www.netflix.com/title/81280792");
      const body = String(res.body || "");
      if (res.status >= 200 && res.status < 400 && !/Not Available|page-404|NSEZ-403/i.test(body)) {
        return "✅ 可用";
      }
      if (res.status === 404) return "🟡 仅自制剧";
      return "❌ 受限";
    } catch (_) { return "❌ 不可达"; }
  }

  async function checkYouTube() {
    try {
      const res = await viaPolicy("https://www.youtube.com/premium",
        { "Accept-Language": "en-US,en;q=0.9" });
      const body = String(res.body || "");
      const m = body.match(/"countryCode"\s*:\s*"([A-Z]{2})"/);
      if (m) return `${getFlag(m[1])}${m[1]} ✅`;
      if (/is not available|not available in your country/i.test(body)) return "❌ 受限";
      if (res.status >= 200 && res.status < 400) return "🌐 可达";
      return "❌ 受限";
    } catch (_) { return "❌ 不可达"; }
  }

  async function checkDisney() {
    try {
      const res = await viaPolicy("https://www.disneyplus.com/");
      if (res.status >= 200 && res.status < 400) return "🌐 可达";
      if (res.status === 403) return "❌ 受限";
      return "❌ 受限";
    } catch (_) { return "❌ 不可达"; }
  }

  // —— 4. AI 可用性（经策略） —— //
  async function checkChatGPT() {
    try {
      const res = await viaPolicy("https://api.openai.com/compliance/cookie_requirements",
        { Origin: "https://platform.openai.com", Referer: "https://platform.openai.com/" });
      const body = String(res.body || "").toLowerCase();
      if (body.includes("unsupported_country")) return "❌ 地区不支持";
      if (res.status >= 200 && res.status < 400) return "✅ 支持";
      if (res.status === 403) return "❌ 受限(403)";
      return "🌐 可达";
    } catch (_) { return "❌ 不可达"; }
  }

  async function checkClaude() {
    try {
      const res = await viaPolicy("https://claude.ai/cdn-cgi/trace");
      if (res.status >= 200 && res.status < 400) {
        const t = parseTrace(res.body);
        return t.loc ? `${getFlag(t.loc)}${t.loc} 🌐 可达` : "🌐 可达";
      }
      if (res.status === 403) return "❌ 受限(403)";
      return "❌ 受限";
    } catch (_) { return "❌ 不可达"; }
  }

  async function checkGemini() {
    try {
      const res = await viaPolicy("https://gemini.google.com/app",
        { "Accept-Language": "en-US,en;q=0.9" });
      const body = String(res.body || "").toLowerCase();
      const blocked = ["not available", "isn't available", "is not available",
        "not currently supported", "your location", "此地区", "不可用", "暂不支持"]
        .some(k => body.includes(k));
      if (res.status < 200 || res.status >= 500) return "❌ 入口不可达";
      if (blocked) return "⚠️ 疑似受限";
      return "🌐 入口可达";
    } catch (_) { return "❌ 不可达"; }
  }

  // —— 执行 —— //
  const lines = [];
  const SEP = "────────────";

  const trace = await getEgress();

  if (!trace || !trace.ip) {
    lines.push(`策略「${POLICY}」出口 IP 获取失败`);
    lines.push("");
    lines.push("可能原因：");
    lines.push("· policy 名称与 Surge 中不一致");
    lines.push("· 该节点当前不可用或超时");
    finish(lines.join("\n"), POLICY);
    return;
  }

  // 出口基础信息
  lines.push(`🛰️ 策略：${POLICY}`);
  lines.push(`IP    : ${maskIP(trace.ip)}`);

  // IP 质量
  let qual = null, q = null;
  try {
    qual = await queryIpQuality(trace.ip);
    q = detectIpQuality(qual);
  } catch (_) { /* 保留 trace 信息 */ }

  if (qual) {
    const loc = [
      getFlag(qual.countryCode || trace.loc || "") + (qual.country || ""),
      qual.regionName && qual.regionName !== qual.city ? qual.regionName : "",
      qual.city || "",
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    lines.push(`归属  : ${loc || "—"}`);
    lines.push(`运营商: ${shorten(qual.isp || qual.org || "—", 28)}`);
    lines.push(`ASN   : ${shorten(qual.as || "—", 32)}`);
    lines.push(`类型  : ${q.type}`);
    lines.push(`风险  : ${q.risk}    纯净度: ${q.score}/100`);
  } else {
    lines.push(`归属  : ${getFlag(trace.loc || "")}${trace.loc || "—"}（详情查询失败）`);
  }

  if (trace.colo) lines.push(`机房  : ${trace.colo}`);
  if (trace.warp) lines.push(`WARP  : ${trace.warp}`);

  // 流媒体 + AI
  if (MEDIA) {
    lines.push(SEP);
    lines.push("📺 流媒体（连通性检测）");
    const [nf, yt, dis] = await Promise.all([checkNetflix(), checkYouTube(), checkDisney()]);
    lines.push(`Netflix : ${nf}`);
    lines.push(`YouTube : ${yt}`);
    lines.push(`Disney+ : ${dis}`);

    lines.push(SEP);
    lines.push("🤖 AI 可用性");
    const [gpt, cld, gem] = await Promise.all([checkChatGPT(), checkClaude(), checkGemini()]);
    lines.push(`ChatGPT : ${gpt}`);
    lines.push(`Claude  : ${cld}`);
    lines.push(`Gemini  : ${gem}`);
  }

  lines.push(SEP);
  lines.push(`🕐 ${timestamp()}`);
  finish(lines.join("\n"), POLICY);

  // —— 辅助 —— //
  function timestamp() {
    const n = new Date();
    const p = x => String(x).padStart(2, "0");
    return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())} ${p(n.getHours())}:${p(n.getMinutes())}`;
  }
})().catch(err => {
  finish(`脚本执行异常：\n${err && err.message ? err.message : String(err)}`, "");
});

// —— 顶层辅助（供 catch 使用） —— //
function finish(content, policy) {
  $done({
    title: policy ? `节点 IP 质量检测 · ${policy}` : "节点 IP 质量检测",
    content,
    icon: "shield.lefthalf.filled",
  });
}

function parseArguments(text) {
  const result = {};
  String(text || "").split("&").forEach(part => {
    if (!part) return;
    const i = part.indexOf("=");
    const key = i >= 0 ? part.slice(0, i) : part;
    const value = i >= 0 ? part.slice(i + 1) : "";
    result[safeDecode(key)] = safeDecode(value);
  });
  return result;
}

function safeDecode(value) {
  try { return decodeURIComponent(String(value).replace(/\+/g, "%20")); }
  catch (_) { return String(value); }
}

function readBoolean(value, fallback) {
  const v = clean(value).toLowerCase();
  if (!v) return fallback;
  if (["true", "1", "yes", "on"].indexOf(v) >= 0) return true;
  if (["false", "0", "no", "off"].indexOf(v) >= 0) return false;
  return fallback;
}

function clean(value) {
  return value === null || typeof value === "undefined" ? "" : String(value).trim();
}

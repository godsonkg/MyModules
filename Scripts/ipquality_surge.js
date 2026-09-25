/**
 * 节点 IP 质量检测 · Surge 面板脚本
 *
 * 通过 $httpClient 的 policy 参数，让所有请求都走指定的节点或策略组，检测：
 *   1. 出口 IP、归属地、机房、WARP 状态
 *   2. IP 类型（住宅 / 数据中心 / 移动 / 代理）和一个粗略的纯净度分
 *   3. Netflix、YouTube、Disney+ 能否访问
 *   4. ChatGPT、Claude、Gemini 是否支持当前地区
 *
 * 参数（模块 argument，& 分隔）：
 *   policy=节点或策略组名，必须和 Surge 里的名字完全一致
 *   media=true|false   是否检测流媒体和 AI，默认 true
 *   mask=true|false    出口 IP 是否打码，默认 false
 *
 * 在首页面板上点按即可运行。
 */

const SCRIPT_VERSION = "2026-09-25.s6";
const TIMEOUT = 8; // 秒。$httpClient 的 timeout 单位是秒

// OpenAI 和 Anthropic 都不提供服务的地区（两家名单的交集，不是完整名单）
const BLOCKED_REGIONS = ["CN", "HK", "MO", "RU", "BY", "IR", "KP", "SY", "CU"];

const DC_RE = new RegExp([
  "google", "aws", "amazon", "azure", "microsoft", "cloudflare", "alibaba", "tencent",
  "digitalocean", "linode", "vultr", "oracle", "ovh", "hetzner", "contabo", "leaseweb",
  "serverius", "choopa", "psychz", "multacom", "zenlayer", "cogent", "hurricane",
  "he\\.net", "buyvm", "frantech", "quadranet", "reliablesite", "sharktech", "steadfast",
  "nexeon", "hostwinds", "datacamp", "m247", "servers\\.com",
].join("|"), "i");

(async () => {
  const options = parseArguments(typeof $argument === "string" ? $argument : "");
  const POLICY = clean(options.policy) || "PROXY";
  const MEDIA = readBoolean(options.media, true);
  const MASK = readBoolean(options.mask, false);

  console.log(`[INFO] IPQuality ${SCRIPT_VERSION} / policy=${POLICY}`);

  // 经指定策略请求
  function viaPolicy(url, extraHeaders) {
    return httpGet({
      url,
      policy: POLICY,
      headers: Object.assign({ "User-Agent": "Mozilla/5.0" }, extraHeaders || {}),
    });
  }

  function maskIP(ip) {
    if (!ip || !MASK) return ip || "—";
    if (ip.indexOf(":") > -1) {
      const parts = ip.split(":");
      return parts.length > 2 ? `${parts[0]}:${parts[1]}:****` : "****";
    }
    const p = ip.split(".");
    return p.length === 4 ? `${p[0]}.${p[1]}.*.*` : ip;
  }

  // —— 出口 IP —— //
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

  // —— 流媒体 —— //
  async function checkNetflix() {
    try {
      // 81280792 是非自制剧，能打开说明完整解锁
      const res = await viaPolicy("https://www.netflix.com/title/81280792");
      const body = String(res.body || "");
      const cc = (body.match(/"requestCountry":\{[^}]*?"id":"([A-Z]{2})"/) || [])[1] || "";
      if (res.status >= 200 && res.status < 400 && !/Not Available|page-404|NSEZ-403/i.test(body)) {
        return cc ? `${flag(cc)}${cc} ✅` : "✅ 完整解锁";
      }
      if (res.status === 404) return "🟡 仅自制剧";
      return "❌ 不支持";
    } catch (_) { return "❌ 连不上"; }
  }

  async function checkYouTube() {
    try {
      const res = await viaPolicy("https://www.youtube.com/premium", { "Accept-Language": "en-US,en;q=0.9" });
      const body = String(res.body || "");
      if (/Premium is not available in your country/i.test(body)) return "❌ 不支持";
      const m = body.match(/"INNERTUBE_CONTEXT_GL"\s*:\s*"([A-Z]{2})"/) || body.match(/"countryCode"\s*:\s*"([A-Z]{2})"/);
      if (m) return `${flag(m[1])}${m[1]} ✅`;
      return res.status >= 200 && res.status < 400 ? "🌐 可访问" : "❌ 不支持";
    } catch (_) { return "❌ 连不上"; }
  }

  async function checkDisney() {
    try {
      const res = await viaPolicy("https://www.disneyplus.com/");
      return res.status >= 200 && res.status < 400 ? "🌐 可访问" : "❌ 不支持";
    } catch (_) { return "❌ 连不上"; }
  }

  // —— AI —— //
  async function checkChatGPT() {
    try {
      const res = await viaPolicy("https://api.openai.com/compliance/cookie_requirements",
        { Origin: "https://platform.openai.com", Referer: "https://platform.openai.com/" });
      const body = String(res.body || "").toLowerCase();
      if (body.includes("unsupported_country")) return "❌ 地区不支持";
      if (res.status >= 200 && res.status < 400) return "✅ 支持";
      if (res.status === 403) return "❌ 受限（403）";
      return "🌐 可访问";
    } catch (_) { return "❌ 连不上"; }
  }

  async function checkClaude() {
    try {
      const res = await viaPolicy("https://claude.ai/cdn-cgi/trace");
      if (res.status < 200 || res.status >= 400) return res.status === 403 ? "❌ 受限（403）" : "❌ 不支持";
      const loc = (parseTrace(res.body).loc || "").toUpperCase();
      if (!loc) return "🌐 可访问";
      if (BLOCKED_REGIONS.indexOf(loc) >= 0) return `${flag(loc)}${loc} ❌ 地区不支持`;
      return `${flag(loc)}${loc} ✅`;
    } catch (_) { return "❌ 连不上"; }
  }

  async function checkGemini() {
    try {
      const res = await viaPolicy("https://gemini.google.com/app", { "Accept-Language": "en-US,en;q=0.9" });
      if (!res.status || res.status >= 500) return "❌ 连不上";
      const body = String(res.body || "");
      const region = (body.match(/,2,1,200,"([A-Z]{3})"/) || [])[1];
      // 页面里带 45631641,null,true 表示当前地区可用
      if (body.includes("45631641,null,true")) return region ? `${region} ✅` : "✅ 支持";
      if (/not (currently )?(available|supported) in your (country|region)/i.test(body)) return "❌ 地区不支持";
      return "⚠️ 未确认";
    } catch (_) { return "❌ 连不上"; }
  }

  // —— 执行 —— //
  const SEP = "────────────";
  const trace = await getEgress();

  if (!trace || !trace.ip) {
    finish([
      `策略「${POLICY}」拿不到出口 IP`,
      "",
      "请检查：",
      "· policy 是否和 Surge 里的名字完全一致（区分大小写）",
      "· 这个节点现在能不能用",
    ].join("\n"), POLICY);
    return;
  }

  // IP 信息、流媒体、AI 同时查
  const [qual, media, ai] = await Promise.all([
    queryIpQuality(trace.ip).catch(() => null),
    MEDIA ? Promise.all([checkNetflix(), checkYouTube(), checkDisney()]) : null,
    MEDIA ? Promise.all([checkChatGPT(), checkClaude(), checkGemini()]) : null,
  ]);

  const lines = [`🛰️ 策略：${POLICY}`, `IP    : ${maskIP(trace.ip)}`];

  if (qual) {
    const q = classify(qual);
    const loc = [
      flag(qual.countryCode || trace.loc) + (qual.country || ""),
      qual.regionName && qual.regionName !== qual.city ? qual.regionName : "",
      qual.city || "",
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    lines.push(`归属  : ${loc || "—"}`);
    lines.push(`运营商: ${shorten(qual.isp || qual.org, 28)}`);
    lines.push(`ASN   : ${shorten(qual.as, 32)}`);
    lines.push(`类型  : ${q.type}`);
    lines.push(`风险  : ${q.risk}    纯净度: ${q.score}/100`);
  } else {
    lines.push(`归属  : ${flag(trace.loc)}${trace.loc || "—"}（ip-api 没查到详情）`);
  }
  if (trace.colo) lines.push(`机房  : ${trace.colo}`);
  if (trace.warp) lines.push(`WARP  : ${trace.warp}`);

  if (media) {
    lines.push(SEP, "📺 流媒体");
    lines.push(`Netflix : ${media[0]}`, `YouTube : ${media[1]}`, `Disney+ : ${media[2]}`);
  }
  if (ai) {
    lines.push(SEP, "🤖 AI");
    lines.push(`ChatGPT : ${ai[0]}`, `Claude  : ${ai[1]}`, `Gemini  : ${ai[2]}`);
  }

  lines.push(SEP, `🕐 ${timestamp()}`);
  finish(lines.join("\n"), POLICY);
})().catch(err => {
  finish(`脚本出错：\n${err && err.message ? err.message : String(err)}`, "");
});

// —— 顶层函数 —— //

function finish(content, policy) {
  $done({
    title: policy ? `节点 IP 质量检测 · ${policy}` : "节点 IP 质量检测",
    content,
    icon: "shield.lefthalf.filled",
  });
}

function httpGet(opts) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, value) => { if (!settled) { settled = true; fn(value); } };
    // 兜底计时器。JSC 引擎没有 clearTimeout，所以用 settled 标记代替
    setTimeout(() => settle(reject, new Error("timeout")), (TIMEOUT + 2) * 1000);
    $httpClient.get(Object.assign({ timeout: TIMEOUT }, opts), (error, response, body) => {
      if (error) return settle(reject, new Error(String(error)));
      settle(resolve, {
        status: (response && (response.status || response.statusCode)) || 0,
        body: body || "",
      });
    });
  });
}

// ip-api.com 直接按规则查询，只需要传 IP
async function queryIpQuality(ip) {
  const fields = "status,message,country,countryCode,regionName,city,isp,org,as,proxy,hosting,mobile";
  const res = await httpGet({
    url: `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=${fields}`,
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const d = JSON.parse(res.body || "{}");
  if (d.status !== "success") throw new Error(d.message || "ip-api 查询失败");
  return d;
}

// 和 AI-Check.js 用同一套分级
function classify(d) {
  const text = `${d.isp || ""} ${d.org || ""} ${d.as || ""}`;
  if (d.mobile) return { type: "📱 移动网络", risk: "低 ✅", score: 85 };
  if (d.proxy) return { type: "🔀 代理/VPN", risk: "高 ⚠️", score: 30 };
  if (d.hosting || DC_RE.test(text)) return { type: "🏢 数据中心", risk: "中 ⚡", score: 45 };
  return { type: "🏠 住宅宽带", risk: "低 ✅", score: 95 };
}

function parseTrace(body) {
  const data = {};
  String(body || "").split("\n").forEach(line => {
    const i = line.indexOf("=");
    if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
  return data;
}

function flag(cc) {
  if (!cc || cc.length !== 2) return "";
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) + " ";
}

function shorten(text, max) {
  if (!text) return "—";
  const s = String(text);
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function timestamp() {
  const n = new Date();
  const p = x => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())} ${p(n.getHours())}:${p(n.getMinutes())}`;
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

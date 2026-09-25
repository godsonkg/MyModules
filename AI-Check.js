/**
 * AI 节点监测 · Surge 面板脚本
 *
 * ChatGPT / Claude：请求各自的 cdn-cgi/trace 拿到实际出口 IP 和地区，
 *   再用 ip-api.com 查归属、运营商和 IP 类型。
 * Gemini：读取网页里的可用标记和地区码。
 *
 * 请求按 Surge 当前规则分流，所以看到的就是这几个域名实际走的节点。
 */

const TIMEOUT = 8; // 秒。$httpClient 的 timeout 单位是秒
const ipCache = {};

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
  const [gpt, claude, gemini] = await Promise.all([
    checkTrace("ChatGPT", "🤖", "https://chatgpt.com/cdn-cgi/trace"),
    checkTrace("Claude", "🔮", "https://claude.ai/cdn-cgi/trace"),
    checkGemini(),
  ]);

  const SEP = "────────────";
  const lines = [...renderTrace(gpt), SEP, ...renderTrace(claude), SEP, ...renderGemini(gemini)];
  lines.push("", `🕐 ${timestamp()}`);
  $done({ title: "🌐 AI 节点监测", content: lines.join("\n") });
})().catch(e => {
  $done({ title: "🌐 AI 节点监测", content: `脚本出错：${(e && e.message) || e}` });
});

// ---------- 检测 ----------

async function checkTrace(name, icon, url) {
  let trace = {};
  try {
    const res = await httpGet({ url, headers: { "User-Agent": "Mozilla/5.0" } });
    trace = parseTrace(res.body);
  } catch (_) {
    return { name, icon, ok: false };
  }
  if (!trace.ip) return { name, icon, ok: false };

  let info = null;
  try { info = await lookupIp(trace.ip); } catch (_) { /* 只显示 trace 信息 */ }
  return { name, icon, ok: true, trace, info };
}

async function checkGemini() {
  let res;
  try {
    res = await httpGet({
      url: "https://gemini.google.com/app",
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" },
    });
  } catch (_) {
    return { label: "❌ 连不上", note: "请求失败或超时" };
  }
  if (!res.status || res.status >= 500) return { label: "❌ 连不上", note: `HTTP ${res.status}` };

  const body = String(res.body || "");
  const region = (body.match(/,2,1,200,"([A-Z]{3})"/) || [])[1] || "";
  // 页面里带 45631641,null,true 表示当前地区可用
  if (body.includes("45631641,null,true")) return { label: "✅ 可用", region };
  if (/not (currently )?(available|supported) in your (country|region)|所在的?(国家|地区)/i.test(body)) {
    return { label: "❌ 地区不支持", region };
  }
  return { label: "⚠️ 未确认", region, note: "页面里没有可用标记" };
}

// 同一次运行里 ChatGPT 和 Claude 往往是同一个出口，查一次就够
function lookupIp(ip) {
  if (!ipCache[ip]) {
    const fields = "status,message,country,countryCode,regionName,city,isp,org,as,proxy,hosting,mobile";
    ipCache[ip] = httpGet({
      url: `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=${fields}`,
      headers: { "User-Agent": "Mozilla/5.0" },
    }).then(res => {
      const d = JSON.parse(res.body || "{}");
      if (d.status !== "success") throw new Error(d.message || "ip-api 查询失败");
      return d;
    });
  }
  return ipCache[ip];
}

// ---------- 输出 ----------

function renderTrace(r) {
  if (!r.ok) return [`${r.icon} ${r.name}   ❌ 连不上`, "没拿到出口 IP"];

  const t = r.trace;
  const blocked = BLOCKED_REGIONS.indexOf((t.loc || "").toUpperCase()) >= 0;
  const status = blocked ? `⚠️ 地区受限（${t.loc}）` : "✅ 可访问";
  const lines = [`${r.icon} ${r.name}   ${status}`, `IP    : ${t.ip}`];

  if (r.info) {
    const d = r.info;
    const q = classify(d);
    const place = [flag(d.countryCode || t.loc) + (d.country || t.loc || ""),
      d.regionName !== d.city ? d.regionName : "", d.city]
      .filter(Boolean).join(" ");
    lines.push(`归属  : ${place || "—"}`);
    lines.push(`运营商: ${shorten(d.isp || d.org, 28)}`);
    lines.push(`类型  : ${q.type}`);
    lines.push(`风险  : ${q.risk}   纯净度: ${q.score}/100`);
  } else {
    lines.push(`归属  : ${flag(t.loc)}${t.loc || "—"}（ip-api 没查到）`);
  }
  lines.push(`机房  : ${t.colo || "—"}`);
  lines.push(`WARP  : ${t.warp || "—"}`);
  return lines;
}

function renderGemini(r) {
  const lines = [`✨ Gemini   ${r.label}`];
  if (r.region) lines.push(`地区  : ${r.region}`);
  if (r.note) lines.push(`说明  : ${r.note}`);
  return lines;
}

// 和 Scripts/ipquality_surge.js 用同一套分级
function classify(d) {
  const text = `${d.isp || ""} ${d.org || ""} ${d.as || ""}`;
  if (d.mobile) return { type: "📱 移动网络", risk: "低 ✅", score: 85 };
  if (d.proxy) return { type: "🔀 代理/VPN", risk: "高 ⚠️", score: 30 };
  if (d.hosting || DC_RE.test(text)) return { type: "🏢 数据中心", risk: "中 ⚡", score: 45 };
  return { type: "🏠 住宅宽带", risk: "低 ✅", score: 95 };
}

// ---------- 工具 ----------

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

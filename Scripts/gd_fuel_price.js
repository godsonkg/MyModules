
/**
 * 广东油价 - Surge 面板脚本
 * 用法：搭配模块中的 [Panel] 与 [Script]，支持定时刷新
 * 参数(argument)：
 *   source=<URL>       // 你的 JSON 原始链接（Raw）
 *   ttl=<秒>           // 缓存有效期（默认 21600 = 6 小时）
 *   province=广东      // 面板标题里展示
 *
 * JSON 结构示例（guangdong_fuel.json）：
 * {
 *   "province": "广东",
 *   "updated_at": "2025-08-27 08:00:00",
 *   "unit": "元/升",
 *   "items": [
 *     {"name": "92#", "price": 8.32},
 *     {"name": "95#", "price": 9.00},
 *     {"name": "98#", "price": 10.20},
 *     {"name": "0# 柴油", "price": 8.00}
 *   ],
 *   "source": "数据来源说明"
 * }
 */

const $ = typeof $task !== 'undefined' ? {
  get: (o) => $task.fetch(o),
  done: (v) => $done(v),
  notify: (t, s, b) => $notify(t, s, b),
  write: (v, k) => $prefs.setValueForKey(v, k),
  read: (k) => $prefs.valueForKey(k)
} : {
  get: (o) => new Promise((resolve) => $httpClient.get(o, (e, r, d) => resolve({ error: e, response: r, body: d }))),
  done: (v) => $done(v),
  notify: (t, s, b) => $notification.post(t, s, b),
  write: (v, k) => $persistentStore.write(v, k),
  read: (k) => $persistentStore.read(k)
};

function parseArgs(str) {
  const out = {};
  if (!str) return out;
  str.split('&').forEach(kv => {
    const [k, v=''] = kv.split('=');
    out[k.trim()] = decodeURIComponent(v);
  });
  return out;
}

const args = parseArgs(typeof $argument !== 'undefined' ? $argument : '');
const SOURCE = args.source || 'https://raw.githubusercontent.com/<your_github_username>/MyModules/main/data/guangdong_fuel.json';
const TTL = parseInt(args.ttl || '21600', 10);
const PROV = args.province || '广东';

const CACHE_KEY = 'gd_fuel_cache';
const CACHE_TIME_KEY = 'gd_fuel_cache_time';

const EMBEDDED = {
  "province": "广东",
  "updated_at": "示例数据（离线内置）",
  "unit": "元/升",
  "items": [
    {"name": "92#", "price": 8.32},
    {"name": "95#", "price": 9.00},
    {"name": "98#", "price": 10.20},
    {"name": "0# 柴油", "price": 8.00}
  ],
  "source": "内置示例（请尽快替换为真实数据源）"
};

function fmt(data) {
  const lines = (data.items || []).map(it => `${it.name}: ${it.price} ${data.unit || ''}`);
  const updated = data.updated_at || 'N/A';
  const src = data.source ? `\n来源：${data.source}` : '';
  return {
    title: `${PROV}油价`,
    content: `更新时间：${updated}\n` + lines.join('\n') + src,
    icon: "fuelpump.fill",
    "icon-color": "#1E90FF"
  };
}

function hasValidCache() {
  const t = parseInt($.read(CACHE_TIME_KEY) || '0', 10);
  if (!t) return false;
  const now = Math.floor(Date.now() / 1000);
  return (now - t) < TTL;
}

function readCache() {
  const raw = $.read(CACHE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function writeCache(obj) {
  $.write(JSON.stringify(obj), CACHE_KEY);
  $.write(String(Math.floor(Date.now() / 1000)), CACHE_TIME_KEY);
}

(async () => {
  // 1. 若缓存有效，先用缓存
  if (hasValidCache()) {
    const cached = readCache();
    if (cached) return $.done(fmt(cached));
  }

  // 2. 拉取远端
  try {
    const res = await $.get({ url: SOURCE, headers: { 'Cache-Control': 'no-cache' } });
    let status = res.status || (res.response && res.response.status);
    let body = res.body || (res.data && res.data);
    if (!status && res.response) status = res.response.status;
    if (status >= 200 && status < 300 && body) {
      const data = JSON.parse(body);
      writeCache(data);
      return $.done(fmt(data));
    }
    // 失败则尝试缓存
    const cached = readCache();
    if (cached) return $.done(fmt(cached));
    // 再失败则用内置
    return $.done(fmt(EMBEDDED));
  } catch (e) {
    const cached = readCache();
    if (cached) return $.done(fmt(cached));
    return $.done(fmt(EMBEDDED));
  }
})();

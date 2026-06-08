/**
 * 广东油价 - Surge 面板脚本
 * --------------------------------------------------
 * 作用：从 GitHub 上的 JSON 拉取广东省成品油价，展示在 Surge 面板。
 *      数据由本仓库的 GitHub Actions 自动更新，脚本只负责读取与展示。
 *
 * 搭配模块：Surge/GD_FuelPrice.sgmodule（[Panel] + [Script]）
 *
 * argument 参数：
 *   source=<URL>   你的 JSON 原始(Raw)链接，默认指向本仓库的 data/guangdong_fuel.json
 *   ttl=<秒>       本地缓存有效期，默认 21600（6 小时）
 *   province=广东  面板标题里展示的省份名称
 *
 * 数据容错：远端拉取失败时，依次回退到「本地缓存」与「脚本内置示例」，保证面板不空白。
 *
 * JSON 结构示例（data/guangdong_fuel.json）：
 *   {
 *     "province": "广东",
 *     "updated_at": "2026-06-08 02:31:18",
 *     "unit": "元/升",
 *     "items": [
 *       {"name": "92#", "price": 7.13},
 *       {"name": "95#", "price": 7.73},
 *       {"name": "98#", "price": 9.73},
 *       {"name": "0# 柴油", "price": 6.76}
 *     ],
 *     "source": "数据来源说明"
 *   }
 */

// 兼容 Surge / Quantumult X 两套运行时 API
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

// 解析 argument（形如 a=1&b=2）为对象
function parseArgs(str) {
  const out = {};
  if (!str) return out;
  str.split('&').forEach(kv => {
    const [k, v = ''] = kv.split('=');
    out[k.trim()] = decodeURIComponent(v);
  });
  return out;
}

const args = parseArgs(typeof $argument !== 'undefined' ? $argument : '');
const SOURCE = args.source || 'https://raw.githubusercontent.com/godsonkg/MyModules/main/data/guangdong_fuel.json';
const TTL = parseInt(args.ttl || '21600', 10);
const PROV = args.province || '广东';

const CACHE_KEY = 'gd_fuel_cache';
const CACHE_TIME_KEY = 'gd_fuel_cache_time';

// 内置示例：仅在远端拉取失败且无缓存时兜底，避免面板空白
const EMBEDDED = {
  province: '广东',
  updated_at: '示例数据（离线内置）',
  unit: '元/升',
  items: [
    { name: '92#', price: 8.32 },
    { name: '95#', price: 9.00 },
    { name: '98#', price: 10.20 },
    { name: '0# 柴油', price: 8.00 }
  ],
  source: '内置示例（网络异常时显示）'
};

// 把数据格式化为 Surge 面板对象
function fmt(data) {
  const lines = (data.items || []).map(it => `${it.name}: ${it.price} ${data.unit || ''}`);
  const updated = data.updated_at || 'N/A';
  const src = data.source ? `\n来源：${data.source}` : '';
  return {
    title: `${PROV}油价`,
    content: `更新时间：${updated}\n` + lines.join('\n') + src,
    icon: 'fuelpump.fill',
    'icon-color': '#1E90FF'
  };
}

// 缓存读写
function hasValidCache() {
  const t = parseInt($.read(CACHE_TIME_KEY) || '0', 10);
  if (!t) return false;
  const now = Math.floor(Date.now() / 1000);
  return (now - t) < TTL;
}

function readCache() {
  const raw = $.read(CACHE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function writeCache(obj) {
  $.write(JSON.stringify(obj), CACHE_KEY);
  $.write(String(Math.floor(Date.now() / 1000)), CACHE_TIME_KEY);
}

// 统一取出 HTTP 响应的状态码与响应体（兼容不同运行时返回结构）
function pickStatusAndBody(res) {
  const status = res.status || (res.response && res.response.status) || 0;
  const body = res.body || res.data || '';
  return { status, body };
}

(async () => {
  // 1. 缓存仍在有效期内，直接用缓存，省一次网络请求
  if (hasValidCache()) {
    const cached = readCache();
    if (cached) return $.done(fmt(cached));
  }

  // 2. 拉取远端 JSON
  try {
    const res = await $.get({ url: SOURCE, headers: { 'Cache-Control': 'no-cache' } });
    const { status, body } = pickStatusAndBody(res);

    if (status >= 200 && status < 300 && body) {
      const data = JSON.parse(body);
      writeCache(data);
      return $.done(fmt(data));
    }

    // 2a. 拉取失败：回退到上次成功的缓存
    const cached = readCache();
    if (cached) return $.done(fmt(cached));

    // 2b. 仍无数据：使用内置示例兜底
    return $.done(fmt(EMBEDDED));
  } catch (e) {
    // 3. 异常（超时 / 解析失败等）：同样按 缓存 -> 内置示例 兜底
    const cached = readCache();
    if (cached) return $.done(fmt(cached));
    return $.done(fmt(EMBEDDED));
  }
})();

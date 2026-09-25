/**
 * 广东油价 · Surge 面板脚本
 *
 * 读取 data/guangdong_fuel.json 并显示在面板上。JSON 由本仓库的 GitHub Actions
 * 每天抓取、校验后提交，脚本只负责读取和展示。
 *
 * 搭配模块：Surge/GD_FuelPrice.sgmodule
 *
 * argument：
 *   source=<URL>   数据 JSON 地址，默认是本仓库的 data/guangdong_fuel.json
 *   ttl=<秒>       缓存有效期，默认 3600
 *   province=广东  面板标题里的省份名
 *
 * 自动刷新时优先用缓存；手动点按面板会跳过缓存。
 * 拉取失败时显示上次成功的数据；从来没成功过就提示失败，不显示编造的价格。
 */

// 兼容 Surge / Quantumult X
const $ = typeof $task !== 'undefined' ? {
  get: (o) => $task.fetch(o),
  done: (v) => $done(v),
  write: (v, k) => $prefs.setValueForKey(v, k),
  read: (k) => $prefs.valueForKey(k)
} : {
  get: (o) => new Promise((resolve) => $httpClient.get(o, (e, r, d) => resolve({ error: e, response: r, body: d }))),
  done: (v) => $done(v),
  write: (v, k) => $persistentStore.write(v, k),
  read: (k) => $persistentStore.read(k)
};

// 解析 a=1&b=2 形式的 argument，值里可以再带 =
function parseArgs(str) {
  const out = {};
  if (!str) return out;
  str.split('&').forEach(kv => {
    const i = kv.indexOf('=');
    if (i <= 0) return;
    const v = kv.slice(i + 1);
    try { out[kv.slice(0, i).trim()] = decodeURIComponent(v); } catch (_) { out[kv.slice(0, i).trim()] = v; }
  });
  return out;
}

const args = parseArgs(typeof $argument !== 'undefined' ? $argument : '');
const SOURCE = args.source || 'https://raw.githubusercontent.com/godsonkg/MyModules/main/data/guangdong_fuel.json';
const TTL = parseInt(args.ttl || '3600', 10);
const PROV = args.province || '广东';
const MANUAL = typeof $trigger !== 'undefined' && $trigger === 'button';

const CACHE_KEY = 'gd_fuel_cache';
const CACHE_TIME_KEY = 'gd_fuel_cache_time';

function formatPrice(price) {
  const n = Number(price);
  return Number.isFinite(n) ? n.toFixed(2) : String(price);
}

function fmt(data, note) {
  const lines = (data.items || []).map(it => `${it.name}: ${formatPrice(it.price)} ${data.unit || ''}`);
  const priceType = data.price_type ? `\n口径：${data.price_type}` : '';
  const src = data.source ? `\n来源：${data.source}` : '';
  return {
    title: `${PROV}油价`,
    content: `更新时间：${data.updated_at || '未知'}\n` + lines.join('\n') + priceType + src +
      '\n提示：加油站实际售价可能不同' + (note ? `\n${note}` : ''),
    icon: 'fuelpump.fill',
    'icon-color': '#1E90FF'
  };
}

function failPanel() {
  return {
    title: `${PROV}油价`,
    content: '没拿到油价数据，可能是 GitHub Raw 连不上。\n稍后点按面板重试。',
    icon: 'exclamationmark.triangle.fill',
    'icon-color': '#FF9500'
  };
}

// 只接受结构完整、价格合理的数据，避免异常页面污染缓存
function isValidData(data) {
  if (!data || !Array.isArray(data.items) || data.items.length < 4) return false;
  const prices = data.items.map(item => Number(item.price));
  return prices.every(price => Number.isFinite(price) && price >= 4 && price <= 20);
}

function cacheAge() {
  const t = parseInt($.read(CACHE_TIME_KEY) || '0', 10);
  return t ? Math.floor(Date.now() / 1000) - t : Infinity;
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

// 兼容两种运行时的返回结构
function pickStatusAndBody(res) {
  const r = res.response || {};
  const status = res.statusCode || res.status || r.status || r.statusCode || 0;
  const body = res.body || res.data || '';
  return { status, body };
}

function fallback() {
  const cached = readCache();
  return $.done(cached ? fmt(cached, '（网络失败，显示的是缓存）') : failPanel());
}

(async () => {
  // 自动刷新且缓存没过期：直接用缓存
  if (!MANUAL && cacheAge() < TTL) {
    const cached = readCache();
    if (cached) return $.done(fmt(cached));
  }

  try {
    const sep = SOURCE.includes('?') ? '&' : '?';
    const res = await $.get({ url: `${SOURCE}${sep}_=${Date.now()}`, headers: { 'Cache-Control': 'no-cache' } });
    const { status, body } = pickStatusAndBody(res);
    if (status >= 200 && status < 300 && body) {
      const data = JSON.parse(body);
      if (!isValidData(data)) throw new Error('油价数据结构或价格范围异常');
      writeCache(data);
      return $.done(fmt(data));
    }
    return fallback();
  } catch (e) {
    return fallback();
  }
})();

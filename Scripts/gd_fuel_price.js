/**
 * 广东油价 · Surge 面板脚本
 *
 * 读取 data/guangdong_fuel.json 并显示在面板上。JSON 由本仓库的 GitHub Actions
 * 每四小时抓取、校验后提交，脚本只负责读取和展示。
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
const DEFAULT_SOURCE = 'https://raw.githubusercontent.com/godsonkg/MyModules/main/data/guangdong_fuel.json';
const SOURCE = args.source || DEFAULT_SOURCE;
const TTL = parseInt(args.ttl || '3600', 10);
const PROV = args.province || '广东';
const MANUAL = typeof $trigger !== 'undefined' && $trigger === 'button';

const CACHE_KEY = 'gd_fuel_cache';
const CACHE_TIME_KEY = 'gd_fuel_cache_time';

function formatPrice(price) {
  if (price === null || price === undefined) return '暂无可信数据';
  const n = Number(price);
  return Number.isFinite(n) ? n.toFixed(2) : String(price);
}

// 最新公告是“不作调整”时说明一下，免得把较早的调价日期误当成数据过期
function noticeLine(data) {
  const n = data.latest_notice;
  if (n && n.date && n.adjusted && n.date > data.updated_at) return `\n待生效公告：${n.date}，生效前继续显示现行价`;
  if (!n || !n.date || n.adjusted || n.date === data.updated_at) return '';
  return `\n最新公告：${n.date} 不作调整，以上价格仍有效`;
}

function fmt(data, note) {
  const lines = (data.items || []).map(it => `${it.name}: ${formatPrice(it.price)}${it.price == null ? '' : ' ' + (data.unit || '')}`);
  const priceType = data.price_type ? `\n口径：${data.price_type}` : '';
  const src = data.source ? `\n来源：${data.source}` : '';
  const checked = data.checked_at ? `\n最近核对：${data.checked_at}` : '';
  const checkedTime = Date.parse(`${data.checked_at}T00:00:00+08:00`);
  const stale = Number.isFinite(checkedTime) && Date.now() - checkedTime > 3 * 86400000
    ? '\n提醒：超过三天未成功核对，请留意更新状态' : '';
  const health = data.official_status && data.official_status !== 'ok'
    ? '\n状态：官方核对失败，以下为上次成功数据' : '';
  const reference = data.reference_state && data.reference_state !== 'synced'
    ? `\n98#：${data.reference_status}（参考日期：${data.reference_updated_at || '未知'}）` : '';
  const warning = Boolean(stale || health || reference || note);
  return {
    title: `${PROV}油价`,
    content: `调价日期：${data.updated_at || '未知'}` + checked + health + noticeLine(data) + '\n' + lines.join('\n') + reference + priceType + src + stale +
      '\n提示：加油站实际售价可能不同' + (note ? `\n${note}` : ''),
    icon: 'fuelpump.fill',
    'icon-color': warning ? '#FF9500' : '#1E90FF'
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
  if (!data || !Array.isArray(data.items) || data.items.length !== 4) return false;
  const names = ['92#', '95#', '98#', '0# 柴油'];
  if (!names.every(name => data.items.filter(item => item && item.name === name).length === 1)) return false;
  const byName = Object.fromEntries(data.items.map(item => [item.name, item.price]));
  const valid = p => typeof p === 'number' && Number.isFinite(p) && p >= 4 && p <= 20;
  if (!['92#', '95#', '0# 柴油'].every(name => valid(byName[name]))) return false;
  if (!(byName['0# 柴油'] < byName['92#'] && byName['92#'] < byName['95#'])) return false;
  return valid(byName['98#']) || (data.schema_version === 2 && data.reference_state === 'unavailable' && byName['98#'] === null);
}

function cacheAge() {
  const t = parseInt($.read(CACHE_TIME_KEY) || '0', 10);
  return t ? Math.floor(Date.now() / 1000) - t : Infinity;
}

function readCache() {
  const raw = $.read(CACHE_KEY);
  if (!raw) return null;
  try { const data = JSON.parse(raw); return isValidData(data) ? data : null; } catch (e) { return null; }
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

async function requestWithDeadline(options) {
  let timer;
  try {
    return await Promise.race([
      $.get(options),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('请求超时')), 3500); })
    ]);
  } finally { clearTimeout(timer); }
}

(async () => {
  // 自动刷新且缓存没过期：直接用缓存
  if (!MANUAL && cacheAge() < TTL) {
    const cached = readCache();
    if (cached) return $.done(fmt(cached));
  }

  // Both endpoints belong to GitHub. Custom source URLs are never substituted.
  const urls = SOURCE === DEFAULT_SOURCE ? [SOURCE,
    'https://api.github.com/repos/godsonkg/MyModules/contents/data/guangdong_fuel.json?ref=main'] : [SOURCE];
  for (const url of urls) {
   try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await requestWithDeadline({ url: `${url}${sep}_=${Date.now()}`, headers: {
      'Cache-Control': 'no-cache', 'Accept': 'application/vnd.github.raw+json', 'User-Agent': 'MyModules-Fuel-Panel'
    } });
    const { status, body } = pickStatusAndBody(res);
    if (status >= 200 && status < 300 && body) {
      const data = JSON.parse(body);
      if (!isValidData(data)) throw new Error('油价数据结构或价格范围异常');
      const cached = readCache();
      if (cached && (data.updated_at < cached.updated_at ||
          (data.updated_at === cached.updated_at && data.checked_at && cached.checked_at && data.checked_at < cached.checked_at))) {
        throw new Error('返回的数据落后于缓存');
      }
      writeCache(data);
      return $.done(fmt(data));
    }
   } catch (e) { /* Try the next GitHub endpoint, then retain validated cache. */ }
  }
  return fallback();
})();

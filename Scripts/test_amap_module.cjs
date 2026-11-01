const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const modulePath = path.join(__dirname, '..', 'Surge', 'Amap', 'Amap_AdBlock.sgmodule');

// Surge 用 ICU 正则，支持开头的 (?i)；JS 不支持内联写法，转成 i 标志
function toRegExp(src) {
  return src.startsWith('(?i)') ? new RegExp(src.slice(4), 'i') : new RegExp(src);
}

function parseModule() {
  const sections = {};
  let sec = null;
  for (const raw of fs.readFileSync(modulePath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (/^\[.+\]$/.test(line)) { sec = line; sections[sec] = []; continue; }
    if (sec && line && !line.startsWith('#')) sections[sec].push(line);
  }
  const jq = sections['[Body Rewrite]'].map(l => {
    const m = /^http-response-jq (\S+) '(.*)'$/.exec(l);
    assert.ok(m, `bad jq line: ${l}`);
    return { re: toRegExp(m[1]), expr: m[2] };
  });
  return {
    rewrite: sections['[URL Rewrite]'].map(l => toRegExp(l.split(' ')[0])),
    mapLocal: sections['[Map Local]'].map(l => toRegExp(l.split(' ')[0])),
    jq,
    rules: sections['[Rule]'],
    mitm: sections['[MITM]'][0].split('=')[1].replace('%APPEND%', '').split(',').map(s => s.trim()),
  };
}
const m = parseModule();
const hit = (rs, u) => rs.some(r => r.test(u));
const jqHit = u => m.jq.some(j => j.re.test(u));
const inMitm = u => m.mitm.includes(new URL(u).hostname);

const MAP_LOCAL = [
  'https://m5.amap.com/ws/valueadded/alimama/splash_screen?x=1',
  'https://m5.amap.com/ws/faas/amap-navigation/main-page-assets?x=1',
  'https://ai.amap.com/v1/ai_rec/home_qs?x=1',
  'https://m5-zb.amap.com/ws/promotion-web/resource?x=1',
  'https://m5-zb.amap.com/ws/promotion-web/resource/home?x=1',
  'https://m5.amap.com/ws/shield/search_business/process/marketingOperationStructured?x=1',
  'https://m5.amap.com/ws/shield/search_poi/tips_adv?x=1',
];
const REWRITE = ['https://m5.amap.com/ws/asa/ads_attribution?x=1'];
const JQ = [
  'https://m5.amap.com/ws/shield/frogserver/aocs/updatable/1?x=1',
  'https://m5-zb.amap.com/ws/boss/car/order/content_info?x=1',
  'https://m5-zb.amap.com/ws/amap/hitch/passenger/content_info?x=1',
  'https://m5.amap.com/ws/smartui/near_recommend?x=1',
];
// 导航、路线、公交、搜索、地点详情、我的页、天气这些不能动
const KEEP = [
  'https://m5.amap.com/ws/perception/drive/routePlan?x=1',
  'https://m5.amap.com/ws/bus/plan/integrate?x=1',
  'https://m5.amap.com/ws/aos/perception/publicTravel/beforeNavi?x=1',
  'https://m5.amap.com/ws/shield/search_poi/sug?x=1',
  'https://m5.amap.com/ws/shield/search_poi/homepage?x=1',
  'https://info.amap.com/ws/shield/search/poi/detail?x=1',
  'https://m5.amap.com/ws/shield/dsp/profile/index/nodefaasv3?x=1',
  'https://m5.amap.com/ws/faas/amap-navigation/main-page?x=1',
  'https://m5.amap.com/ws/faas/amap-navigation/card-service-route-plan?x=1',
  'https://m5.amap.com/ws/valueadded/weather/v2?x=1',
  'https://m5.amap.com/ws/shield/frogserver/aocs/updatable/2?x=1',
];

test('ad endpoints hit Map Local / rewrite / jq', () => {
  for (const u of MAP_LOCAL) assert.ok(hit(m.mapLocal, u), u);
  for (const u of REWRITE) assert.ok(hit(m.rewrite, u), u);
  for (const u of JQ) assert.ok(jqHit(u), u);
});
test('Map Local endpoints are not also rejected or rewritten', () => {
  for (const u of MAP_LOCAL) assert.ok(!hit(m.rewrite, u) && !jqHit(u), u);
});
test('feature endpoints are left alone', () => {
  for (const u of KEEP) assert.ok(!hit(m.rewrite, u) && !hit(m.mapLocal, u) && !jqHit(u), u);
});
test('every https URL we touch is covered by MITM', () => {
  for (const u of [...MAP_LOCAL, ...REWRITE, ...JQ]) assert.ok(inMitm(u), u);
});
test('rule lines have no trailing comments', () => {
  for (const l of m.rules) assert.ok(!l.includes('#'), l);
});

// ---- jq 表达式用真 jq 跑；CI 和大多数 Linux 自带 jq，没有就跳过 ----
let hasJq = true;
try { execFileSync('jq', ['--version']); } catch { hasJq = false; }
const runJq = (expr, obj) => JSON.parse(execFileSync('jq', ['-c', expr], { input: JSON.stringify(obj) }).toString());
const exprFor = u => m.jq.find(j => j.re.test(u)).expr;

test('aocs config: ad keys removed, other config kept', { skip: !hasJq }, () => {
  const data = { splashscreen: { a: 1 }, adStatementConfig: 1, hotel_activity: 1, marketing_resource_config: [],
    '920bestwishes': 1, wallet: { on: 1 }, free_ride: 1, comment_info: 1, navi_voice: 'x' };
  const out = runJq(exprFor(JQ[0]), { code: 1, data });
  assert.deepEqual(out, { code: 1, data: { wallet: { on: 1 }, free_ride: 1, comment_info: 1, navi_voice: 'x' } });
});
test('taxi page: bubble and popup removed, the rest kept', { skip: !hasJq }, () => {
  const out = runJq(exprFor(JQ[1]), { data: { lubanData: { popup: 1, kingToolBoxBubble: 1, skin: 's', kingToolSort: [1] } } });
  assert.deepEqual(out, { data: { lubanData: { skin: 's', kingToolSort: [1] } } });
});
test('jq expressions tolerate missing fields and null data', { skip: !hasJq }, () => {
  for (const { expr } of m.jq) {
    for (const input of [{}, { data: null }, { data: {} }, { data: 'error' }, { data: { lubanData: 'x' } }, { code: 0, message: 'fail' }]) {
      assert.deepEqual(runJq(expr, input), input, expr);
    }
  }
});

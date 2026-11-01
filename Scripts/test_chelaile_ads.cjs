const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const script = fs.readFileSync(path.join(__dirname, 'chelaile_ads.js'), 'utf8');
const modulePath = path.join(__dirname, '..', 'Surge', 'CheLaiLe', 'CheLaiLe_AdBlock.sgmodule');

function run(body) {
  let out, calls = 0;
  vm.runInNewContext(script, { $response: { body }, $done: v => { calls++; out = v; } }, { timeout: 1000 });
  assert.equal(calls, 1);
  return out;
}
const wrap = obj => `**YGKJ${JSON.stringify(obj)}YGKJ##`;
const unwrap = s => JSON.parse(s.slice(6, -6));

test('removes ad and HTTPDNS switches, keeps everything else', () => {
  const data = { splashAdType: 1, preloadAds: 1, useHttpDns: 1, appBackupDomains: ['1.2.3.4'],
    welfareSignUrl: 'x', oneLoginType: 2, voiceSearchMode: 1, busRefreshTime: 15 };
  const out = run(wrap({ jsonr: { status: '00', data } }));
  assert.ok(out.body.startsWith('**YGKJ') && out.body.endsWith('YGKJ##'));
  const d = unwrap(out.body).jsonr.data;
  assert.deepEqual(d, { oneLoginType: 2, voiceSearchMode: 1, busRefreshTime: 15 });
});

test('works without the YGKJ wrapper', () => {
  const out = run(JSON.stringify({ jsonr: { data: { adStrategy: 1, x: 1 } } }));
  assert.deepEqual(JSON.parse(out.body).jsonr.data, { x: 1 });
});

test('leaves body untouched when nothing to change or unparsable', () => {
  for (const body of [wrap({ jsonr: { data: { x: 1 } } }), '**YGKJ{bad json YGKJ##', wrap({ jsonr: { data: [] } }), '']) {
    assert.equal(run(body).body, undefined, body);
  }
});

// ---- 模块规则 ----
function parseModule() {
  const sections = {};
  let sec = null;
  for (const raw of fs.readFileSync(modulePath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (/^\[.+\]$/.test(line)) { sec = line; sections[sec] = []; continue; }
    if (sec && line && !line.startsWith('#')) sections[sec].push(line);
  }
  const first = l => new RegExp(l.split(' ')[0]);
  const scriptPatterns = sections['[Script]'].map(l => new RegExp(/pattern=([^,]+)/.exec(l)[1]));
  const mitm = sections['[MITM]'][0].split('=')[1].replace('%APPEND%', '').split(',').map(s => s.trim());
  return {
    rewrite: sections['[URL Rewrite]'].map(first),
    mapLocal: sections['[Map Local]'].map(first),
    script: scriptPatterns,
    mitm,
    mapLocalLines: sections['[Map Local]'],
  };
}
const m = parseModule();
const hit = (rs, u) => rs.some(r => r.test(u));
const glob = p => new RegExp('^' + p.replace(/[.]/g, '\\.').replace(/\*/g, '.*') + '$');
const inMitm = u => { const h = new URL(u).hostname; return m.mitm.some(p => glob(p).test(h)); };

const REWRITE = [
  'https://api.chelaile.net.cn/adpub/sdk/adConfig?x=1',
  'https://cdn.api.chelaileapp.cn/adpub/sdk/adConfig?x=1',
  'https://web.chelaile.net.cn/api/adpub/adv!getGuideAds.action',
  'https://cdn.web.chelaileapp.cn/api/adpub/x',
  'https://api.chelaile.net.cn/goocity/advert/list',
  'https://web.chelaile.net.cn/feserver/vip-page/images/a.png',
  'https://api.chelaile.net.cn/DataAnalysisInfo/UdidFilter',
  'https://pic1.chelaile.net.cn/adv/abc.jpg',
  'http://124.70.194.16/adpub/sdk/adConfig?x',
];
const MAP_LOCAL = [
  'https://api.chelaile.net.cn/goocity/flowPos/home?a=1',
  'https://cdn.api.chelaileapp.cn/goocity/flowPos/home?a=1',
  'http://124.70.194.16/goocity/flowPos/listByPos?a=1',
  'https://api.chelaile.net.cn/goocity/flowPos/listByPos?a=1',
  'https://api.chelaile.net.cn/encourage/activity/control?a=1',
  'https://web.chelaile.net.cn/api/operative_position/infoflow/getInfo?a=1',
  'https://cdn.web.chelaile.net.cn/info-flow/index.html?a=1',
];
const SCRIPT = [
  'https://api.chelaile.net.cn/bus-side/appToggle/getStatus?s=1',
  'https://web.chelaile.net.cn/api/bus-side/appToggle/getStatus?s=1',
  'http://124.71.153.172/bus-side/appToggle/getStatus?s=1',
];
const KEEP = [
  'https://api.chelaile.net.cn/bus/line!lineDetail.action?x',
  'https://api.chelaileapp.cn/bus/stop!nearlines.action?x',
  'https://api.chelaile.net.cn/goocity/city/list',
  'https://api.chelaile.net.cn/goocity/config/notices?x',
  'https://api.chelaile.net.cn/led-weather/v2/condition_brief?x',
  'https://pic1.chelaile.net.cn/station/a.png',
  'https://image3.chelaile.net.cn/89iIqxaM.png',
  'https://web.chelaile.net.cn/metro/index.html?h5_stats_referer=icon',
  'http://124.70.194.16/bus/line',
];

test('ad endpoints are rejected by URL Rewrite', () => {
  for (const u of REWRITE) assert.ok(hit(m.rewrite, u), u);
});
test('mocked endpoints hit Map Local and are not swallowed by a reject first', () => {
  for (const u of MAP_LOCAL) {
    assert.ok(hit(m.mapLocal, u), u);
    assert.ok(!hit(m.rewrite, u), `rewrite shadows map local: ${u}`);
  }
});
test('config cleaner matches all appToggle hosts', () => {
  for (const u of SCRIPT) assert.ok(hit(m.script, u), u);
});
test('business endpoints are left alone', () => {
  for (const u of KEEP) {
    assert.ok(!hit(m.rewrite, u) && !hit(m.mapLocal, u) && !hit(m.script, u), u);
  }
});
test('every https URL we touch is covered by MITM', () => {
  for (const u of [...REWRITE, ...MAP_LOCAL, ...SCRIPT].filter(u => u.startsWith('https'))) {
    assert.ok(inMitm(u), u);
  }
});
test('base64 Map Local payloads decode to valid YGKJ JSON', () => {
  for (const line of m.mapLocalLines) {
    const b = /data-type=base64 data="([^"]+)"/.exec(line);
    if (!b) continue;
    const text = Buffer.from(b[1], 'base64').toString('utf8');
    assert.match(text, /^\*\*YGKJ[\s\S]*YGKJ##$/);
    JSON.parse(text.slice(6, -6));
  }
});

test('ad SDK request domains use REJECT-DROP to avoid retry storms', () => {
  const rules = fs.readFileSync(modulePath, 'utf8').split('\n').filter(l => /^(DOMAIN|DOMAIN-SUFFIX),/.test(l));
  const policy = host => (rules.find(l => l.split(',')[1] === host) || '').split(',')[2];
  for (const h of ['logs.chelaile.net.cn', 'ad.chelaile.net.cn', 'atrace.chelaile.net.cn', 'pangolin-sdk-toutiao1.com', 'pangolin-sdk-toutiao.com', 'yg84.com', 'mi.gdt.qq.com', 'mobads.baidu.com']) {
    assert.equal(policy(h), 'REJECT-DROP', h);
  }
  for (const h of ['smartimg.chelaile.net.cn', 'pglstatp-toutiao.com', 'qzs.gdtimg.com']) {
    assert.equal(policy(h), 'REJECT', h);
  }
});

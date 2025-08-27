/**
 * Streaming Unlock Tester for Surge 5.15+
 * 目标：检测一组“候选策略/地区组/节点”在 Netflix / Disney+ / YouTube Premium 的可解锁性。
 * 亮点：支持一键写入到选择组。
 */

const $http = $httpClient;
function getArgs() {
  const out = {};
  const arg = (typeof $argument === 'string') ? $argument : '';
  arg.split('&').forEach(kv => {
    if (!kv) return;
    const [k, v=''] = kv.split('=');
    out[k] = decodeURIComponent(v);
  });
  return out;
}
function httpGet(url, policy, timeout) {
  return new Promise(resolve => {
    const opt = { url, timeout: (timeout || 6) * 1000, headers: { 'User-Agent': 'SurgeUnlockProbe' } };
    if (policy) opt['policy'] = policy;
    $http.get(opt, (err, resp, body) => resolve({ err, resp, body, policy }));
  });
}
async function testNetflix(policy, timeout) {
  const url = 'https://www.netflix.com/title/80062035';
  try {
    const { err, resp, body } = await httpGet(url, policy, timeout);
    const sc = (resp && resp.status) || 0;
    if (err) return { ok: false, reason: 'network' };
    if (sc === 403 || sc === 404) return { ok: false, reason: String(sc) };
    if (body && /not\s+available|unavailable|不可用|无法观看/i.test(body)) return { ok: false, reason: 'unavailable' };
    return { ok: sc > 0, reason: String(sc) };
  } catch (e) { return { ok: false, reason: 'exception' }; }
}
async function testDisney(policy, timeout) {
  const url = 'https://www.disneyplus.com/';
  try {
    const { err, resp, body } = await httpGet(url, policy, timeout);
    const sc = (resp && resp.status) || 0;
    if (err) return { ok: false, reason: 'network' };
    if (sc === 403) return { ok: false, reason: '403' };
    if (body && /not\s+available|unavailable|不在您所在的地区/i.test(body)) return { ok: false, reason: 'unavailable' };
    return { ok: sc > 0, reason: String(sc) };
  } catch (e) { return { ok: false, reason: 'exception' }; }
}
async function testYouTubePremium(policy, timeout) {
  const url = 'https://www.youtube.com/premium';
  try {
    const { err, resp, body } = await httpGet(url, policy, timeout);
    const sc = (resp && resp.status) || 0;
    if (err) return { ok: false, reason: 'network' };
    if (sc === 403) return { ok: false, reason: '403' };
    if (body && /not\s+available|unavailable|您所在的国家/i.test(body)) return { ok: false, reason: 'unavailable' };
    return { ok: sc > 0, reason: String(sc) };
  } catch (e) { return { ok: false, reason: 'exception' }; }
}
async function testOne(policy, target, timeout) {
  if (target === 'nf') return testNetflix(policy, timeout);
  if (target === 'disney') return testDisney(policy, timeout);
  if (target === 'yt') return testYouTubePremium(policy, timeout);
  return { ok: false, reason: 'unknown_target' };
}
async function run() {
  const args = getArgs();
  const target = (args.target || 'nf').toLowerCase();
  const concurrency = parseInt(args.concurrency || '2', 10);
  const timeout = parseInt(args.timeout || '6', 10);
  const candidates = (args.candidates || '🇺🇸美国候选|🇯🇵日本候选|🇭🇰香港候选').split('|').map(s => s.trim()).filter(Boolean);
  const results = [];
  for (let pol of candidates) {
    const r = await testOne(pol, target, timeout);
    results.push({ policy: pol, ...r });
  }
  const okList = results.filter(x => x.ok).map(x => x.policy);
  const failList = results.filter(x => !x.ok).map(x => `${x.policy} (${x.reason})`);
  const selectGroup = target === 'nf' ? 'NF-选择' : (target === 'disney' ? 'DISNEY-选择' : 'YT-选择');
  const titleMap = { nf: 'Netflix', disney: 'Disney+', yt: 'YouTube Premium' };
  const iconMap = { nf: 'play.rectangle.on.rectangle', disney: 'sparkles.tv', yt: 'play.tv' };
  const okStr = okList.length ? okList.join(' | ') : '未检测到可用节点/组';
  const failStr = failList.length ? failList.join(' | ') : '无';
  let actions = [];
  if (okList.length && typeof $surge !== 'undefined' && $surge.setSelectGroupPolicy) {
    const chosen = okList[0];
    actions.push({ "title": `写入到「${selectGroup}」→ ${chosen}`, "action": "set_policy", "group": selectGroup, "policy": chosen });
  }
  const content = [`候选：${candidates.join(' | ')}`, `可用：${okStr}`, `不可用：${failStr}`].join('\n');
  const panel = { title: `${titleMap[target]} 解锁检测`, content, icon: iconMap[target], "icon-color": "#E50914", actions };
  $done(panel);
}
run();

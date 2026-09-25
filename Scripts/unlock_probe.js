/**
 * unlock_probe.js · YouTube Premium 解锁检测（Surge 面板）
 *
 * 用法：
 *   [Script]
 *   unlock_probe = type=generic,timeout=60,script-path=https://raw.githubusercontent.com/godsonkg/MyModules/main/Scripts/unlock_probe.js,argument="target=yt&policy=YouTube-Unlock&candidates=节点A|节点B|节点C"
 *   [Panel]
 *   YouTube解锁 = script-name=unlock_probe,title="YouTube 解锁检测",content="点按开始检测"
 *
 * 参数（& 分隔，argument 要加引号）：
 *   target=yt              检测目标，目前只有 YouTube Premium/Music
 *   policy=组名            可选。把第一个通过的候选节点切到这个 select 策略组
 *   candidates=A|B|C       可选。要逐个检测的节点，| 分隔；不填只检测当前出口
 *   timeout=6              可选。单个请求超时，单位秒
 */

const ARG = parseArgs(typeof $argument === "string" ? $argument : "");
const TARGET = (ARG.target || "yt").toLowerCase();
const POLICY_GROUP = ARG.policy;
const CANDIDATES = (ARG.candidates || "").split("|").map(s => s.trim()).filter(Boolean);
const TIMEOUT = Number(ARG.timeout) || 6; // 秒

const TESTS = {
  yt: [
    "https://www.youtube.com/premium",
    "https://m.youtube.com/premium",
    "https://music.youtube.com/premium",
  ],
};

(async () => {
  const urls = TESTS[TARGET];
  if (!urls) return finish("YouTube 解锁检测", `不认识的 target：${TARGET}，目前只支持 target=yt`, "questionmark.circle");

  // 没给候选节点就只测当前出口
  const nodes = CANDIDATES.length ? CANDIDATES : [null];
  const ok = [];
  for (const node of nodes) {
    const region = await testYT(urls, node);
    if (region) ok.push({ node, region });
  }

  let switched = "";
  const first = ok.length && ok[0].node;
  if (POLICY_GROUP && first && typeof $surge !== "undefined" && $surge.setSelectGroupPolicy) {
    try {
      if ($surge.setSelectGroupPolicy(POLICY_GROUP, first)) switched = `\n已把 ${POLICY_GROUP} 切到 ${first}`;
    } catch (_) { /* 节点不在该组里时会失败，忽略 */ }
  }

  const names = ok.map(r => `${r.node || "当前出口"}${r.region === true ? "" : `（${r.region}）`}`);
  return ok.length
    ? finish("YouTube 解锁检测", `可用：${names.join("、")}${switched}`, "checkmark.seal.fill")
    : finish("YouTube 解锁检测", "没有找到可用节点，或 YouTube 连不上", "xmark.seal.fill");
})();

// 返回地区码（字符串）、true（可用但没拿到地区）或 false
async function testYT(urls, policyName) {
  for (const url of urls) {
    const res = await httpGet(url, policyName);
    if (!res) continue;
    const b = res.body || "";
    if (/Premium is not available in your country|not available in your location/i.test(b)) return false;
    const m = b.match(/"INNERTUBE_CONTEXT_GL"\s*:\s*"([A-Z]{2})"/) || b.match(/"countryCode"\s*:\s*"([A-Z]{2})"/);
    if (m) return m[1];
    if (/YouTube Premium|Background play|Download videos/i.test(b)) return true;
  }
  return false;
}

function httpGet(url, policyName) {
  return new Promise(resolve => {
    const opt = { url, headers: { "Accept-Language": "en" }, timeout: TIMEOUT };
    if (policyName) opt.policy = policyName;
    $httpClient.get(opt, (err, resp, body) => {
      if (err || !resp) return resolve(null);
      resolve({ status: resp.status, body });
    });
  });
}

function parseArgs(str) {
  const o = {};
  // 兼容旧写法的逗号分隔
  String(str || "").split(/[&,]/).forEach(kv => {
    const i = kv.indexOf("=");
    if (i > 0) o[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  });
  return o;
}

function finish(title, content, icon) {
  $done({ title, content, icon: icon || "play.rectangle.fill" });
}

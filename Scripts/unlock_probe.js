/**
 * unlock_probe.js
 * 用途：检测节点是否解锁 YouTube Premium/Music。
 * 用法（Surge Panel）：
 *   script-name=unlock_probe, argument=target=yt,policy=YouTube-Unlock,candidates=节点A|节点B|节点C
 *
 * 参数说明：
 *  - target=yt                目标：YouTube Premium/Music
 *  - policy=组名              可选。若提供，则把“检测通过的第一个节点”写入该策略组
 *  - candidates=节点1|节点2   可选。要检测的候选节点，用 | 分隔；不填则只检测当前出站
 */

const ARG = parseArgs($argument || "");
const TARGET = (ARG.target || "yt").toLowerCase();
const POLICY_GROUP = ARG.policy;            // 例如：YouTube-Unlock
const CANDIDATES = (ARG.candidates || "").split("|").filter(Boolean);
const TIMEOUT = Number(ARG.timeout || 6000);

const TESTS = {
  yt: [
    "https://www.youtube.com/premium",
    "https://m.youtube.com/premium",
    "https://music.youtube.com/premium"
  ]
};

// ——入口——
(async () => {
  const urls = TESTS[TARGET];
  if (!urls) return finish("❓ 未知 target", "请用 target=yt");

  // 如果未传 candidates，则只测一次当前策略
  const nodes = CANDIDATES.length ? CANDIDATES : [undefined];

  const ok = [];
  for (const node of nodes) {
    const unlocked = await testYT(urls, node);
    if (unlocked) ok.push(node || "Current");
  }

  // 写入策略组：把第一个通过的节点设置到指定组
  if (POLICY_GROUP && ok.length && $surge && $surge.setSelectGroupPolicy) {
    try {
      await $surge.setSelectGroupPolicy(POLICY_GROUP, ok[0] === "Current" ? undefined : ok[0]);
    } catch (e) {}
  }

  const title = "YouTube 解锁检测";
  const icon  = ok.length ? "checkmark.seal.fill" : "xmark.seal.fill";
  const content = ok.length
    ? `✔ 已解锁节点：${ok.join(", ")}${POLICY_GROUP ? `\n→ 已写入策略组：${POLICY_GROUP}` : ""}`
    : "✖ 未发现解锁节点（或目标站点不可达）";

  return finish(title, content, icon);
})();

// ——函数区——
async function testYT(urls, policyName) {
  for (const url of urls) {
    const res = await httpGet(url, policyName);
    if (!res) continue;

    const b = res.body || "";
    // 判定规则：
    // 1) 存在 countryCode 字段通常表示可用
    // 2) 英文页面上的不可用提示关键字
    if (/"countryCode":"[A-Z]{2}"/.test(b)) return true;
    if (/Premium is not available in your country|not available in your location/i.test(b)) return false;
    // 有时返回 200 且含有 Premium 文案即视为可用
    if (/YouTube Premium|Background play|Download videos/i.test(b)) return true;
  }
  return false;
}

function httpGet(url, policyName) {
  return new Promise((resolve) => {
    const opt = { url, headers: { "Accept-Language": "en" } , timeout: TIMEOUT };
    if (policyName && $environment?.platform === "surge") opt.policy = policyName;
    $httpClient.get(opt, (err, resp, body) => {
      if (err || !resp) return resolve(null);
      resolve({ status: resp.status, headers: resp.headers, body });
    });
  });
}

function parseArgs(str) {
  const o = {};
  (str || "").split(",").forEach(kv => {
    const i = kv.indexOf("=");
    if (i > 0) o[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  });
  return o;
}

function finish(title, content, sficon = "bolt.horizontal.circle") {
  if (typeof $done === "function") {
    $done({ title, content, icon: sficon });
  }
}
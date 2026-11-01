/*
 * 车来了去广告：清洗 bus-side/appToggle/getStatus 下发的配置
 * 搭配模块：Surge/CheLaiLe/CheLaiLe_AdBlock.sgmodule
 *
 * 1. 删掉开屏、插屏、信息流、搜索页广告和福利任务的开关，App 回退到默认（不拉广告）
 * 2. 删掉 useHttpDns / appBackupDomains：不让 App 改用 HTTPDNS 或 IP 直连，
 *    这样广告请求还走域名，才能被 MITM 和重写拦到
 *
 * 字段参考可莉的 Chelaile_remove_ads.js（2026-07-04）。登录、语音、AI 助手这些
 * 和广告无关的开关不动。
 * 响应体格式是 **YGKJ{json}YGKJ##，前后缀原样保留。解析失败就不改。
 */
(() => {
  const AD_KEYS = [
    // 开屏、弹窗
    'splashAdType', 'splashCloseTime', 'sadt', 'sat', 'dynamicSplashTime', 'splashCoverBar',
    'splashSkipShowType', 'splashGray', 'enableSplashGray', 'ttSplashUsePhonePixel',
    'skipPopType', 'skipPopTime', 'skipStopDis', 'adPopExhibitTime', 'isAdPopExhibit',
    'bdShowSplashDialog', 'bdCloseDownloadDisplay', 'appInstallExhibitInterval',
    // 广告策略、预加载、插屏
    'adStrategy', 'adConfigTriggerDelayTime', 'adNeedAnimate', 'needFetchInterstitialAd',
    'intersitialAdPre', 'nativeAdFetchType', 'preloadAds', 'expressAdDelayRefreshTime',
    'disableAdAutoRefresh', 'reportAdNumLimit', 'ldrAdAnimal',
    // 摇一摇、滑动跳转
    'shakeLeve', 'feedAdClickSlipRegionType', 'feedAdClickSlipShowType',
    'feedBackCutType', 'feedBackShakeType',
    // 搜索页广告
    'searchAdPos', 'searchPageAdType', 'searchPageAdAnimation', 'showTopSearchAd',
    // 信息流（快手等）
    'feedInfoSource', 'kuaishouFeedId', 'newKuaishouFeedId', 'newKuaishouPicUrl',
    'newKuaishouShowType', 'newKuaishouHigh', 'showKSVideoHeader',
    // 福利任务入口
    'welfareColor', 'welfareAllPage', 'welfareUrl', 'welfareSignUrl',
    // 网络：防止绕过 MITM
    'useHttpDns', 'appBackupDomains', 'blacklistDomains',
  ];

  const body = typeof $response !== 'undefined' && $response && $response.body;
  if (typeof body !== 'string' || !body) return $done({});

  const start = body.indexOf('YGKJ');
  const end = body.lastIndexOf('YGKJ');
  const wrapped = start !== -1 && end > start;
  const head = wrapped ? body.slice(0, start + 4) : '';
  const tail = wrapped ? body.slice(end) : '';
  const json = wrapped ? body.slice(start + 4, end) : body;

  let obj;
  try { obj = JSON.parse(json); } catch (e) { return $done({}); }

  const data = obj && obj.jsonr && obj.jsonr.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return $done({});

  let changed = false;
  for (const key of AD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      delete data[key];
      changed = true;
    }
  }
  if (!changed) return $done({});

  $done({ body: head + JSON.stringify(obj) + tail });
})();

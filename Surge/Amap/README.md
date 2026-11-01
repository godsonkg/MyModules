# 高德地图去广告

| 模块 | 版本 | 说明 |
| --- | --- | --- |
| [高德地图去广告](Amap_AdBlock.sgmodule) | 2026.11.01-r1 | 去掉开屏、首页推广、打车页弹窗、搜索营销位和活动入口，要开 MITM |

## 安装

Surge →「模块」→「从 URL 安装」：

```
https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Amap/Amap_AdBlock.sgmodule
```

版本要求：**Surge iOS 5.14.0+**。模块用到了 `[Body Rewrite]` 的 jq 改写，旧版本 Surge 会跳过这一段。

- 在规则模式下用，打开「重写」
- 打开 MITM，并安装、信任 Surge 的 CA 证书
- 装好后强制退出高德再打开；开屏还在的话清一下缓存（开屏素材会提前缓存）

## 去掉了什么

| 位置 | 接口 | 做法 |
| --- | --- | --- |
| 开屏广告 | `valueadded/alimama/splash_screen`、`amap-aos-info-nogw.amap.com` | 返回空数据 / 域名拒绝 |
| 开屏、广告位、营销活动的开关 | `frogserver/aocs/updatable/1` | jq 删掉 25 个配置项 |
| 首页推广卡片、右上角动图 | `amap-navigation/main-page-assets` | 返回空数据 |
| 首页底部推荐信息流 | `ai.amap.com/v1/ai_rec/home_qs` | 返回空数据 |
| 打车页红点、推广资源位 | `m5-zb.amap.com/ws/promotion-web/resource` | 返回空数据 |
| 打车页工具栏气泡、弹窗 | `boss/car/order/content_info` | jq 删 `kingToolBoxBubble`、`popup` |
| 顺风车乘客页横幅 | `hitch/passenger/content_info` | jq 删 `banner` |
| 附近推荐里的运营活动 | `smartui/near_recommend` | jq 删 `operation_activity` |
| 搜索页营销位 | `marketingOperationStructured`、`search_poi/tips_adv` | 返回空数据 |
| 广告图片、归因上报 | `free-aos-cdn-image.amap.com`、`asa/ads_attribution` | 拒绝 |

启动配置里删掉的配置项：开屏（`splashscreen`、`SplashScreenControl`、`splashview_config`）、广告（`adStatementConfig`、`adImEntryConfig`、`adVenueConfig`、`EndNaviC3AdCard`、`infoCpcReport` 等）、营销资源位（`marketing_resource_config`、`homepage_resource_config`、`hotsaleConfig`、`giftEntryConfig`、`sug_coupon_opt`）、酒店 / 打车 / 火车票 / 运动活动和挽留弹窗。完整列表见模块文件。

### AMDC

高德用阿里的 AMDC（`amdc.m.taobao.com/amdc/mobileDispatch`）下发 IP 地址，拿到后部分接口会用 IP 直连，绕过域名，MITM 和重写都拦不到。模块按 UA（`AMapiPhone*`）只挡高德的这条请求，淘宝、支付宝不受影响。这是明文 http 请求，不需要 MITM。

## 和可莉版的区别

可莉的模块（2026-10-20）除了去广告，还做了界面精简。这些这里**没有照搬**：

- “我的”页只留足迹和一个入口卡片，其余全删
- 删掉钱包（`wallet`）、顺风车（`free_ride`）、评论（`comment_info`）、设置页搜索（`setpagesearch`）
- 搜索框只留快捷入口、历史和“搜索发现”，删掉底纹词；搜索建议只留两类
- 工具推荐只留 4 个固定入口，去掉各处的红点和角标文字
- 清掉 `coupon_risk_asac`（领券风控）这类风控配置

想要这种精简效果，可以直接用可莉的模块，但别和本模块同时开。

## 确认模块生效

在 Safari 里输入（必须是 http）：`http://amap-check.invalid/?v=r1`，应显示“r1 已加载”。

这只能说明模块开着、重写在工作。广告有没有拦住，要看 Surge「最近请求」里对应请求有没有命中本模块的 Map Local、Body Rewrite 或 REJECT。

## 已知问题

**响应超过 1 MB 不会改写。** Surge iOS 的 Body Rewrite 只处理 1 MB 以内的响应体，更大的原样放行。启动配置一般在这个范围内。

**jq 出错时原样放行。** 每条 jq 表达式都包了 `try ... catch`，接口返回格式变了（比如 `data` 变成字符串）时不改响应，不会把页面弄坏，但那一处的广告也就去不掉了。

**导航结束页、路线规划页的推广卡片没处理。** 墨鱼、Jard1n 会把 `card-service-route-plan`、`card-service-car-end` 整个清空，但可莉最新版已经不这么做了，这两个接口里也有正常的路线信息。

**整台设备生效。** 规则只匹配高德域名和高德的 UA，对其他 App 没有影响。

## 本地检查

```
node --test Scripts/test_amap_module.cjs
```

会检查：广告接口都能命中，导航、路线、公交、搜索、地点详情、“我的”页、天气这些接口不会被误改；所有 https 地址都在 MITM 列表里；jq 表达式用真 jq 跑一遍，确认只删目标字段，遇到字段缺失、`data` 为 null 或字符串时原样返回。没装 jq 时会跳过 jq 那几项。

## 提交诊断记录

发请求记录时，最好带上请求详情里的域名、路径、命中的规则和 MITM 备注。账号、Cookie、Token 和查询参数请遮住。

## 更新记录

- **r1**：首个版本。以可莉 2026-10-20 版为主，只保留去广告和营销的部分；补上 AMDC、`tips_adv`、广告归因；jq 表达式加了出错保护。

## 参考

各家 2026-11-01 抓取的版本：

- 可莉 Amap_remove_ads（2026-10-20，[镜像](https://github.com/KIDA-MNESIA/gadgets/blob/main/module/kelee/Amap_remove_ads.sgmodule)）
- [ddgksf2013 AmapAds](https://github.com/ddgksf2013/Rewrite/blob/master/AdBlock/AmapAds.conf)（2025-12-06）
- [zirawell amap](https://github.com/zirawell/R-Store/blob/main/Rule/Surge/Adblock/App/G/%E9%AB%98%E5%BE%B7%E5%9C%B0%E5%9B%BE/amap.sgmodule)（2026-05-09）
- [Jard1n 高德模块](https://github.com/Jard1n/VPN_Tool/blob/main/Surge/Module/Amap.sgmodule)、[BlackSpacee（RuCu6 / kokoryh 规则）](https://github.com/BlackSpacee/Surge/blob/main/Module/AdBlock/aMap.sgmodule)：AMDC 规则
- Surge 手册：[Body Rewrite](https://manual.nssurge.com/http/body-rewrite.html)、[Map Local](https://manual.nssurge.com/http/map-local.html)、[MITM](https://manual.nssurge.com/http/mitm.html)

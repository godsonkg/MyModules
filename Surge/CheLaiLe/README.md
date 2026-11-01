# 车来了去广告

| 模块 | 版本 | 说明 |
| --- | --- | --- |
| [车来了去广告](CheLaiLe_AdBlock.sgmodule) | 2026.11.01-r1 | 域名拦截，加广告接口重写，重写部分要开 MITM |

## 安装

Surge →「模块」→「从 URL 安装」：

```
https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/CheLaiLe/CheLaiLe_AdBlock.sgmodule
```

版本要求：Surge iOS 5.9.1+。

- 在规则模式下用，打开「重写」
- 打开 MITM，并安装、信任 Surge 的 CA 证书
- 装好后强制退出车来了再打开；还看到旧广告就清一下 App 缓存

没开 MITM 时，[Rule] 里的域名拦截照样生效：横幅素材 CDN（`cdn.smartimg.chelaile.net.cn`）和穿山甲、广点通、百度、亿广这些广告 SDK 都能挡住。只是广告配置接口还能取到，可能会留下空白的广告位。

## 拦了什么

- 车来了自有：`ad.`、`atrace.`、`logs.chelaile.net.cn`，横幅素材 `smartimg.chelaile.net.cn`
- 广告接口（需要 MITM）：`adpub/`、`goocity/flowPos/home`、`goocity/flowPos/listByPos`、`goocity/advert/`、`encourage/activity/control`、`DataAnalysisInfo/`、`pic1.chelaile.net.cn/adv/`
- 第三方广告 SDK：穿山甲、腾讯广点通（只拦广告子域）、百度联盟、亿广、易点天下等

公交、站点、线路、天气、通知这些接口不拦，也没有整段拦 `chelaile.net.cn`。

## 确认模块生效

在 Safari 里输入（必须是 http）：`http://chelaile-check.invalid/?v=r1`，应显示“r1 已加载”。

这只能说明模块开着、重写在工作，不能说明广告已经拦住。广告有没有拦住，要看 Surge「最近请求」里对应请求命中的是不是本模块的 REJECT 或重写。

## 已知问题

**整台设备生效。** 穿山甲、广点通、百度联盟这些规则对所有 App 都有效，别的 App 的“看广告领奖励”可能会失败。

**IP 直连只能挡明文。** 车来了有时直接用 IP 请求广告配置。模块只匹配 `http://IP/...`；如果是 https 的 IP 直连，要把那个 IP 加进 MITM 才行，模块里没有加。

**缓存和预取。** 广告 SDK 会缓存上次的素材，拦住配置后可能还会再播一次缓存的广告。

**横幅换域名。** 如果首页横幅又出来了，多半是素材换了新域名。在最近请求里找 `flowPos/home` 或 `adpub/sdk/adConfig` 的响应，看 `bigIcon`、`iconUrl` 字段里的图片地址。

## 故意没拦

这些在参考模块里有，但误伤面太大，这里没放进来：

- `image3.chelaile.net.cn`：混着定位、站点图标这些业务图片
- `jomoxc.com`：百度广告视频的备用回源，但它是共用动态 CDN
- `webcast-open.douyin.com`、`lf-cdn-tos.bytescm.com`：抖音直播和字节通用 CDN
- `mssdk.volces.com`、`apmplus.volces.com`、`vod-license-m.volccdn.com`：火山引擎的安全、监控、播放器授权，不是广告本身
- `feed-image.baidu.com`、`qh-material.taobao.com`、`gungnir.xiaojukeji.com`、`tdid.m.qq.com`：百度、淘宝、滴滴、腾讯 App 自己也在用
- 极光、个推、友盟的推送和统计：拦了收不到到站提醒
- `api.map.baidu.com`：拦了定位和地图会失效

## 提交诊断记录

发请求记录时，最好带上请求详情里的域名、路径、命中的规则和 MITM 备注。账号、Cookie、Token 和查询参数请遮住。

## 更新记录

- **r1**：首个版本。以 CaoXiaoMann 的 7.6.7 抓包规则为主，合并 fmz200 的规则；删掉已被 [Rule] 整段拦截域名的重写和 MITM（`ad.`、`atrace.`、`land.yg84.com` 等），去掉误伤面大的共用 CDN 和推送统计域名。

## 参考

- [CaoXiaoMann 车来了模块](https://github.com/CaoXiaoMann/XiaoMan/blob/main/Surge/Scripts/CheLaiLe/CheLaiLe.sgmodule)（含 7.6.6 / 7.6.7 抓包说明）
- [fmz200 车来了模块](https://github.com/fmz200/wool_scripts/blob/main/Surge/module/split/partC/CheLaiLe.sgmodule)
- Surge 手册：[MITM](https://manual.nssurge.com/http/mitm.html)、[URL 重写](https://manual.nssurge.com/http/url-rewrite.html)

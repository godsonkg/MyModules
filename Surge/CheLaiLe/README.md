# 车来了去广告

| 模块 | 版本 | 说明 |
| --- | --- | --- |
| [车来了去广告](CheLaiLe_AdBlock.sgmodule) | 2026.11.01-r4 | 域名拦截，加广告接口重写和配置清洗，接口部分要开 MITM |

## 安装

Surge →「模块」→「从 URL 安装」：

```
https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/CheLaiLe/CheLaiLe_AdBlock.sgmodule
```

版本要求：Surge iOS 5.9.1+。

- 在规则模式下用，打开「重写」和「脚本」
- 打开 MITM，并安装、信任 Surge 的 CA 证书
- 装好后强制退出车来了再打开；还看到旧广告就清一下 App 缓存

没开 MITM 时，[Rule] 里的域名拦截照样生效：横幅素材 CDN（`cdn.smartimg.chelaile.net.cn`）和穿山甲、广点通、百度、亿广这些广告 SDK 都能挡住。只是广告配置接口还能取到，可能会留下空白的广告位。

## 拦了什么

| 位置 | 做法 | 需要 MITM |
| --- | --- | --- |
| 车来了广告、埋点域名（`ad.`、`atrace.`、`logs.`）、横幅素材 `smartimg` | 域名拒绝 | 否 |
| 穿山甲、广点通（只拦广告子域）、百度联盟、亿广等 SDK | 域名拒绝 | 否 |
| 广告配置 `adpub/`、`goocity/advert/`、`pic1/adv/`、数据上报 | 重写拒绝 | 是 |
| 首页金刚位 `flowPos/home` | 返回固定数据，只留“站点地图”“地铁” | 是 |
| “我的”页运营位、激励任务、线路详情页信息流 | 返回空数据 | 是 |
| 启动配置 `bus-side/appToggle/getStatus` | 脚本删掉广告开关和 HTTPDNS | 是 |

公交、站点、线路、天气、通知这些接口不动，也没有整段拦 `chelaile.net.cn`。

### 为什么要清洗启动配置

车来了启动时会从 `appToggle/getStatus` 取一份配置，里面有开屏、插屏、信息流广告的开关，还有 `useHttpDns`、`appBackupDomains`。后两个会让 App 用 HTTPDNS 解析或直接用 IP（比如 `124.70.194.16`、`124.71.153.172`）请求接口，这样请求就不经过域名，MITM 和重写都拦不到。

脚本 [`Scripts/chelaile_ads.js`](../../Scripts/chelaile_ads.js) 把这些字段删掉，App 用回默认值：不拉广告，接口走域名。登录、语音、AI 助手这些和广告无关的开关不动。脚本解析失败时原样放行，不会把配置弄坏。

### 为什么有的接口返回空数据而不是直接拒绝

`flowPos`、`encourage`、`infoflow` 这几个接口直接拒绝的话，页面会留一块空白或者反复重试。改成返回 `**YGKJ{}YGKJ##`（车来了自己的响应格式）后，App 认为“没有运营位”，页面就干净了。这个格式和首页那两个入口的数据都来自可莉的模块。

## 确认模块生效

在 Safari 里输入（必须是 http）：`http://chelaile-check.invalid/?v=r4`，应显示“r4 已加载”。

这只能说明模块开着、重写在工作，不能说明广告已经拦住。广告有没有拦住，要看 Surge「最近请求」里对应请求命中的是不是本模块的 REJECT、Map Local 或脚本。

## 已知问题

**第一次打开可能报“死循环”。** 广告 SDK 和车来了的日志上报被拒后会立刻重试，第一次打开时 Surge 可能报“过去一秒处理了几百个请求”。Surge 随后会自己把这些地址改为静默丢弃，再打开就没有了，不影响使用。r3 曾经直接写成静默丢弃（`REJECT-DROP`），结果开屏广告又出现了，所以 r4 退回直接拒绝。

**首页入口是写死的。** 首页金刚位只返回“站点地图”和“地铁”两项。所在城市没有地铁时，“地铁”入口可能打不开；车来了以后新增的正常入口也不会显示。

**整台设备生效。** 穿山甲、广点通、百度联盟这些规则对所有 App 都有效，别的 App 的“看广告领奖励”可能会失败。

**IP 直连只能挡明文。** 脚本会关掉 HTTPDNS，但如果 App 已经缓存了 IP，或者 https 的 IP 直连请求，模块拦不到（没有把 IP 加进 MITM）。重启 App 一般就好。

**缓存和预取。** 广告 SDK 会缓存上次的素材，拦住配置后可能还会再播一次缓存的广告。

**横幅换域名。** 如果首页横幅又出来了，多半是素材换了新域名。在最近请求里找 `flowPos/home` 或 `adpub/sdk/adConfig` 的响应，看 `bigIcon`、`iconUrl` 字段里的图片地址。

## 故意没拦

这些在参考模块里有，但误伤面太大或者不属于广告，这里没放进来：

- `image3.chelaile.net.cn`：混着定位、站点图标这些业务图片
- `goocity/config/notices`、`led-weather/condition_brief`：可莉把通知和天气也清空了，但通知里有线路调整这类有用信息
- `goocity/city!` 底栏精简（墨鱼、chikacya 有）：属于界面精简，不是广告
- `jomoxc.com`：百度广告视频的备用回源，是百度自己的边缘节点，可能也承载百度的正常视频。百度 App 去广告模块 r2 起会拦它，两个模块一起开时生效
- `webcast-open.douyin.com`、`lf-cdn-tos.bytescm.com`：抖音直播和字节通用 CDN
- `mssdk.volces.com`、`apmplus.volces.com`、`vod-license-m.volccdn.com`：火山引擎的安全、监控、播放器授权，不是广告本身
- `feed-image.baidu.com`、`qh-material.taobao.com`、`gungnir.xiaojukeji.com`、`tdid.m.qq.com`：百度、淘宝、滴滴、腾讯 App 自己也在用
- 极光、个推、友盟的推送和统计：拦了收不到到站提醒
- `api.map.baidu.com`：拦了定位和地图会失效

## 本地检查

```
node --test Scripts/test_chelaile_ads.cjs
```

会检查：脚本只删广告字段、解析失败时不改响应；模块里的广告地址都能命中，业务地址不会被误拦；返回空数据的接口不会先被重写拒掉；所有 https 地址都在 MITM 列表里；base64 数据能解出合法 JSON。

## 提交诊断记录

发请求记录时，最好带上请求详情里的域名、路径、命中的规则和 MITM 备注。账号、Cookie、Token 和查询参数请遮住。

## 更新记录

- **r4**：撤回 r3，规则和 r2 相同，全部改回 `REJECT`。r3 之后开屏又出现了经亿广下发的穿山甲广告（素材是空的），清缓存、重装 App 都还在，具体从哪个请求拿到的没查出来。亿广的上报里穿山甲请求耗时 4.7 秒，推测是 `REJECT-DROP` 让 SDK 一直等到超时，走了另一条取广告的路。
- **r3**（已撤回）：第一次打开车来了时，穿山甲等 SDK 被拒后不停重试，Surge 报“死循环”（一秒 349 个请求）。广告 SDK 取广告的 14 个域名，以及车来了自己的 `ad.`、`atrace.`、`logs.`（`logs.chelaile.net.cn/h52/report` 被拒后也会不停重试），改为 `REJECT-DROP`；素材和第三方日志域名仍用 `REJECT`。
- **r2**：参考可莉、墨鱼、chikacya 的最新规则：
  - 新增启动配置清洗脚本，删掉广告开关和 HTTPDNS / 备用域名，减少 IP 直连绕过 MITM
  - 首页金刚位改为只留站点地图、地铁，不再整个拒绝
  - “我的”页运营位、激励任务改为返回空数据；新增线路详情页信息流（`operative_position/infoflow`、`cdn.web.chelaile.net.cn/info-flow`）
  - `web.chelaile.net.cn/api/adpub/` 整个目录拒绝（原来只拦 `adpub/ad`），广告图片放宽到 `pic*`
  - IP 写法去掉了正则里的逗号，避免 `[Script]` 参数被截断
- **r1**：首个版本。以 CaoXiaoMann 的 7.6.7 抓包规则为主，合并 fmz200 的规则；删掉已被 [Rule] 整段拦截域名的重写和 MITM，去掉误伤面大的共用 CDN 和推送统计域名。

## 参考

各家 2026-11-01 抓取的版本：

- [CaoXiaoMann 车来了模块](https://github.com/CaoXiaoMann/XiaoMan/blob/main/Surge/Scripts/CheLaiLe/CheLaiLe.sgmodule)（2026-11-01，含 7.6.6 / 7.6.7 抓包说明）：域名规则主要来源
- 可莉 Chelaile_remove_ads（2026-10-02，[镜像](https://github.com/KIDA-MNESIA/gadgets/blob/main/module/kelee/Chelaile_remove_ads.sgmodule)）：空数据格式、首页入口、配置清洗字段
- [ddgksf2013 CheLaiLeAds](https://github.com/ddgksf2013/Rewrite/blob/master/AdBlock/CheLaiLeAds.conf)（2025-10-09）：线路详情页信息流、IP 直连地址
- [chikacya CheLaiLeBlockAD](https://github.com/chikacya/anywhere-rules/blob/main/modules/CheLaiLeBlockAD.amod)：`124.71.153.172` 上的配置接口
- [Zz1xuan Chelaile](https://github.com/Zz1xuan/ONE/blob/main/Rewrite/AdBlock/Chelaile.conf)（2026-05-17 HAR）：`web.chelaile.net.cn/api/bus-side/appToggle`
- [fmz200 车来了模块](https://github.com/fmz200/wool_scripts/blob/main/Surge/module/split/partC/CheLaiLe.sgmodule)、[zirawell](https://github.com/zirawell/R-Store/blob/main/Rule/Surge/Adblock/App/C/%E8%BD%A6%E6%9D%A5%E4%BA%86/chelaile.sgmodule)
- Surge 手册：[MITM](https://manual.nssurge.com/http/mitm.html)、[URL 重写](https://manual.nssurge.com/http/url-rewrite.html)、[Map Local](https://manual.nssurge.com/http/map-local.html)

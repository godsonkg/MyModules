# 番茄小说去广告

轻量版和增强版选一个；增强版已包含轻量版全部规则。直播流模块是单独的临时测试项。

| 模块 | 当前版本 | 用途 |
| --- | --- | --- |
| [轻量版](Fanqie_AdBlock_Lite.sgmodule) | 2026.09.25-r4 | 只拦广告 SDK 与素材域名，无需 MITM，基本不影响其他 App |
| [增强版](Fanqie_AdBlock_Enhanced.sgmodule) | 2026.09.25-r8 | 再拦直播卡片、广告模板、字节 SDK 与上报域名，外加少量 MITM 重写 |
| [直播流临时测试](Fanqie_LiveStream_Test.sgmodule) | 2026.09.25-test1 | 拦截实测中出现的一个共享直播通道，无需 MITM |

## 安装

在 Surge“模块”页面从 URL 安装；已安装的直接点更新：

- [轻量版](https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Fanqie/Fanqie_AdBlock_Lite.sgmodule)
- [增强版](https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Fanqie/Fanqie_AdBlock_Enhanced.sgmodule)
- [直播流临时测试](https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Fanqie/Fanqie_LiveStream_Test.sgmodule)

轻量版需要 Surge iOS 5.8+，另外两个需要 5.9.1+。使用规则模式并打开重写；增强版还要开启 MITM，并安装、信任 Surge 证书。

更新后**强制退出番茄再打开**。App 会缓存广告配置和已下载的广告模板，不重启、甚至不清缓存（我的 → 设置 → 清除缓存）的情况下，旧广告可能还会出现一段时间。

## r8 改了什么

r7 及以前只拦 8 个域名，主要靠 MITM 路径重写；而手机记录显示番茄的视频、SDK 域名多数拒绝 Surge 证书，重写实际大部分没机会生效。r8 改为以**无需解密的域名拦截**为主体：

1. **补齐域名清单**。参照目前维护最新的 [kelee 模块](https://github.com/Masamisuki/Tool/blob/main/iKeLee/%E7%95%AA%E8%8C%84%E5%B0%8F%E8%AF%B4%E5%8E%BB%E5%B9%BF%E5%91%8A.sgmodule)（2026-06-01，纯域名规则、不用 MITM），并与 [zirawell](https://github.com/zirawell/R-Store/blob/main/Rule/Surge/Adblock/App/F/%E7%95%AA%E8%8C%84%E5%B0%8F%E8%AF%B4/fanqie.sgmodule)、[zqzess](https://github.com/zqzess/rule_for_quantumultX/blob/master/Loon/Plugin/FanQieNovel.plugin)、[honue](https://github.com/honue/rules/blob/master/Loon/plugin/FanQieNovel.plugin) 交叉核对，增强版域名规则从 8 条增至 32 条。
2. **拦截字节 HTTPDNS `dig.bdurl.net`**。字节系 App 会通过自家 HTTPDNS 取 IP 后直接连 IP，绕开基于域名的判断。拦截后 App 回退到系统 DNS，其余规则更容易命中。
3. **整域拦截穿山甲**。`pangolin-sdk-toutiao.com`、`pglstatp-toutiao.com` 整个后缀都是广告联盟，不再依赖解密后的路径匹配；轻量版也从单个 `api-access` 子域扩展到整个后缀。
4. **通配 ad-sign / webcast-sign 图片域名**，覆盖 p3、p6、p9、p11 等编号。
5. 路径重写并入 honue 的 `ad-site-adstyle-public` 和 zirawell 的 `gurd …/v\d/package`，删除已被整域拦截覆盖的两条。MITM 列表与 r7 相同，没有新增解密域名。

### 增强版的域名分组

| 分组 | 域名 | 可能影响 |
| --- | --- | --- |
| 广告接口与素材 | `ads*-normal*.zijieapi.com`、`p*-ad-sign.byteimg.com`、`*.pangolin-sdk-toutiao.com`、`*.pglstatp-toutiao.com`、`zlink.ugsdk.cn` | 其他 App 的穿山甲广告（包括“看广告领奖励”） |
| HTTPDNS | `dig.bdurl.net` | 字节系 App 改用系统 DNS，一般无感 |
| 直播卡片 | `content-open.douyin.com`、`webcast-open.douyin.com`、`p*-webcast-sign.douyinpic.com`、`lf-webcast-gr-sourcecdn.bytegecko.com` | 抖音直播封面、开放平台跳转 |
| 模板与实验配置 | `lf-normal-gr-sourcecdn.bytegecko.com`、`gecko3/5.zijieapi.com`、`abtest3-misc.zijieapi.com`、`p3-developer.bytemaimg.com` | 字节系 App 的动态页面更新 |
| 字节 SDK | `i`、`is`、`is-lq`、`vas`、`effect`、`security`.snssdk.com；`ma`、`minigame3/5-normal`、`mssdk`、`timon`、`vcs`、`feedback-c`.zijieapi.com | 小程序、小游戏、拍摄特效；风控 SDK 被拦可能偶发要求重新验证 |
| 番茄上报 | `*-applog.fqnovel.com`、`mon*-misc*.fqnovel.com`、`mon.toutiaocloud.com/.net` | 仅番茄与字节监控 |

Surge iOS 不能按 App 限定规则，以上规则作用于整台设备。经常用抖音、今日头条的话先用轻量版；轻量版挡不住再换增强版。

## 验证与排查

1. Safari 打开本机自检地址（必须 `http://`）：轻量版 `http://fanqie-check.invalid/lite`，增强版 `http://fanqie-check.invalid/?v=r8`。显示对应版本才说明已更新到位；这只证明模块已加载，不代表广告已拦截。
2. 关闭其他番茄去广告模块，只保留一个本仓库版本，强制退出番茄后阅读、翻页十几页。
3. 广告仍出现时，在 Surge 最近请求里筛选出现广告那一刻的请求，记下域名、路径、匹配规则和备注（遮住 Cookie、Token、查询参数），据此再补规则。
4. 番茄某项功能坏了（福利页空白、登录反复验证、听书异常），先换回轻量版确认是否由增强版引起，再把出问题时被 REJECT 的域名反馈回来，逐条放行。
5. 出现大量 `MitM Failed` 时，检查是否有其他模块或主配置把 `*.snssdk.com`、`*.byteimg.com`、`*.fqnovelvod.com` 加进 MITM；这些域名会拒绝 Surge 证书。

仍可能漏掉的情况：广告混在番茄自家接口（如 `reading-hl.snssdk.com` 的阅读数据）中下发，或通过 QUIC、纯 IP 连接。前者需要解密后改写响应，番茄对这些主域名有证书固定，目前没有可靠做法。

## 直播流临时测试

手机记录里出现了 `pull-flv-l1.douyincdn.com/stage/stream-…flv` 的持续下载，以及把域名放进路径的 IPv4 地址形式。测试模块覆盖这两种明文 HTTP 地址，不封禁 CDN IP。该通道也服务正常抖音直播，启用后同通道直播可能无法播放，测试完请关闭。

1. 先确认增强版 r8 工作正常，再开启本模块。
2. 强制退出番茄，在阅读页翻页，不点进直播间。
3. 看直播卡片是否仍播放，以及 `pull-flv-l1` 请求是否被重写拒绝。自检地址：`http://fanqie-check.invalid/live-test`。

## 历史

- r8：以域名拦截为主体，域名规则增至 32 条，新增 HTTPDNS 拦截。
- r7：试加三条直播候选域名。
- r5–r6：撤回 `*.snssdk.com`、`*.byteimg.com`、`*novelapp.fqnovelvod.com` 的 MITM；手机记录确认这些域名在解密后客户端断开连接。
- r4：从 [zqzess FanQieNovel](https://github.com/zqzess/rule_for_quantumultX/blob/master/QuantumultX/rewrite/FanQieNovel.qxrewrite)（SHA `9307684c`）移植路径重写。

参考：[Surge 规则](https://manual.nssurge.com/rule/domain-based.html)、[Surge MITM](https://manual.nssurge.com/http/mitm.html)、[Surge URL 重写](https://manual.nssurge.com/http/url-rewrite.html)。

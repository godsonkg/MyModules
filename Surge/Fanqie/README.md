# 番茄小说去广告

轻量版和增强版选一个。直播流模块是单独的临时测试项。

| 模块 | 当前版本 | 用途 |
| --- | --- | --- |
| [轻量版](Fanqie_AdBlock_Lite.sgmodule) | 2026.09.25-r3 | 拦截几组广告域名，无需 MITM |
| [增强版](Fanqie_AdBlock_Enhanced.sgmodule) | 2026.09.25-r5 | 域名拦截及素材、接口重写，需要 MITM |
| [直播流临时测试](Fanqie_LiveStream_Test.sgmodule) | 2026.09.25-test1 | 拦截实测中出现的一个共享直播通道，无需 MITM |

## 安装

在 Surge“模块”页面从 URL 安装。已经安装的增强版直接更新：

- [轻量版](https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Fanqie/Fanqie_AdBlock_Lite.sgmodule)
- [增强版](https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Fanqie/Fanqie_AdBlock_Enhanced.sgmodule)
- [直播流临时测试](https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Fanqie/Fanqie_LiveStream_Test.sgmodule)

轻量版需要 Surge iOS 5.8+；另外两个模块需要 5.9.1+。使用规则模式，增强版和直播流测试还要打开重写。增强版需要开启 MITM，并安装和信任 Surge 证书。

排查时关闭其他番茄去广告模块，只留增强版。直播流测试可以与增强版一起启用。更新后强制退出番茄，再打开。

## r5 修复的实际问题

r4 添加了 `*.snssdk.com` 和 `*.byteimg.com` 两组 MITM 通配符。手机请求详情随后明确显示：

- `p6-novel.byteimg.com` 命中增强版的 `*.byteimg.com`，随后 MITM 失败。
- `i-lq.snssdk.com` 命中增强版的 `*.snssdk.com`，随后 MITM 失败。
- 客户端在 TLS 握手后断开，Surge 提示可能存在证书固定。这不是“拦截成功”的记录。

r5 撤回这两组通配符。snssdk 仅保留原来的 `reading-hl`、`i-hl` 和 `gurd`；其他 MITM 项为 `*.pstatp.com`、`*novelapp.fqnovelvod.com`、`adim.pinduoduo.com`。不再由本模块解密上述两个失败域名。如果别的模块也把它们加入 MITM，仍可能报错，应看请求详情中标明的来源。

保留从 FanQieNovel 移植的 16 条重写。撤回部分 MITM 后，相应 HTTPS 路径不会被本模块解密和改写；普通 HTTP 不受这项限制。关闭服务器证书验证不能解决客户端拒绝 Surge 证书的问题。

r5 先修复已发现的连接冲突，尚未确认能消除阅读广告。

## 直播流临时测试

手机记录里出现了 `pull-flv-l1.douyincdn.com/stage/stream-…flv` 的持续下载，也出现了把域名放进 URL 路径的 IPv4 地址形式。测试模块覆盖这两种明文 HTTP 地址，不封禁共享 CDN IP。

这条通道也提供正常抖音直播，不能仅凭流地址把它认定为广告专用接口。现有截图包含进入直播间后的画面，尚未确认阅读页预览与进入直播间是否使用相同请求。因此单独提供测试模块，启用后同通道的正常直播也可能无法播放。

测试方法：

1. 更新增强版至 r5，按需安装并开启直播流临时测试。
2. 强制退出番茄，再进入阅读页翻页，先不要点击进入直播间。
3. 看阅读页直播卡片是否仍播放，同时查看 `pull-flv-l1` 请求有无被重写拒绝。
4. 若视频停了但卡片仍在，只能证明这条素材流被挡住，广告入口还未处理。其他视频广告也不一定使用这条通道。
5. 测试结束后关闭直播流模块，恢复正常直播。

## 本机版本检查

在 Safari 输入完整 HTTP 地址：

- 增强版：`http://fanqie-check.invalid/?v=r5`，应显示增强版 r5 已加载。
- 直播测试：`http://fanqie-check.invalid/live-test`，应显示 test1 已加载。

文字由 Surge 在本机返回，不上传数据。检查只证明对应模块的本机重写工作，不证明 MITM 成功或广告已拦截。打不开时核对版本、启用状态、重写开关，以及是否被浏览器改成 HTTPS。

## 使用范围

规则作用于整台设备，可能影响其他 App 的广告、图片、视频和看广告领奖励功能。增强版的剩余 MITM 项也可能遇到应用证书校验；发生异常先关闭模块核对。

分享诊断记录时，优先提供请求详情里的域名、路径、匹配规则和 MITM 备注，遮住账号、Cookie、Token 和查询参数。仅有 DIRECT 或“已修改”标签不足以判断去广告是否生效。模块不修改会员状态。

## 来源

r4 根据用户提供的 Script Hub 链接，从下面的 FanQieNovel 源文件移植了 16 条有效重写，源文件 SHA 为 `9307684c73c474be442e602d5f55d5ba05633518`。转换时修正了 snssdk.com、byteimg.com 的点号转义。源文件中的直播 .flv 行原本被注释，没有作为有效规则移入增强版。

- [FanQieNovel 源文件](https://github.com/zqzess/rule_for_quantumultX/blob/master/QuantumultX/rewrite/FanQieNovel.qxrewrite)
- [最初参考模块](https://yfamilys.com/module/fanqie.module)
- [番茄广告过滤规则](https://github.com/changzhaoCZ/fqnovel-adrules)
- [Surge MITM](https://manual.nssurge.com/http/mitm.html)
- [Surge URL 重写](https://manual.nssurge.com/http/url-rewrite.html)

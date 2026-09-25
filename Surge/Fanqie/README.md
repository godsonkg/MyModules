# 番茄小说去广告

轻量版和增强版装一个就行，别同时开。直播流模块是临时测试用的，平时不用装。

| 模块 | 版本 | 说明 |
| --- | --- | --- |
| [轻量版](Fanqie_AdBlock_Lite.sgmodule) | 2026.09.25-r3 | 只拦几个广告域名，不用 MITM |
| [增强版](Fanqie_AdBlock_Enhanced.sgmodule) | 2026.09.25-r8 | 域名拦截，加素材和接口重写，要开 MITM |
| [直播流临时测试](Fanqie_LiveStream_Test.sgmodule) | 2026.09.25-test1 | 挡一条抖音直播通道，用来排查阅读页直播广告 |

## 安装

Surge →「模块」→「从 URL 安装」：

```
https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Fanqie/Fanqie_AdBlock_Lite.sgmodule
https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Fanqie/Fanqie_AdBlock_Enhanced.sgmodule
https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Fanqie/Fanqie_LiveStream_Test.sgmodule
```

版本要求：轻量版 Surge iOS 5.8+，另外两个 5.9.1+。

- 三个都要在规则模式下用
- 增强版和直播流测试要打开「重写」
- 增强版还要打开 MITM，并安装、信任 Surge 的 CA 证书

## 确认模块生效

在 Safari 里输入（必须是 http）：

- 增强版：`http://fanqie-check.invalid/?v=r8`，应显示“r8 已加载”
- 直播测试：`http://fanqie-check.invalid/live-test`，应显示“test1 已加载”

这段文字是 Surge 在本机直接返回的，只能说明模块开着、重写在工作，不能说明广告已经拦住。打不开的话，检查模块版本、有没有启用、重写开关，以及 Safari 有没有自动改成 https。

广告有没有拦住，要看 Surge「最近请求」：找到对应请求，看它命中的是不是本模块的 REJECT 或重写。

## 已知问题

**视频广告还没解决。** 阅读页的视频插页目前拦不掉。

**不要给视频 CDN 开 MITM。** `*.snssdk.com`、`*.byteimg.com`、`*novelapp.fqnovelvod.com` 解密后，番茄会在 TLS 握手后直接断开（证书固定），请求记录里会出现大量 `MitM Failed`。这几个在 r5、r6 已经从 MITM 里拿掉了。如果还在报错，看请求详情里是哪个模块或主配置加的 MITM。关闭“服务器证书验证”解决不了这个问题。

**整台设备生效。** Surge iOS 没法按 App 限定规则，所以这些规则对所有 App 都生效，可能挡掉别的 App 的广告图、视频或“看广告领奖励”。增强版里的三条直播域名（`content-open.douyin.com`、`webcast-open.douyin.com`、`lf-webcast-gr-sourcecdn.bytegecko.com`）会影响抖音直播，出问题就先关掉增强版。

**剩下的 MITM 也可能失败。** 增强版还保留 `reading-hl.snssdk.com`、`i-hl.snssdk.com`、`gurd.snssdk.com`、`*.pstatp.com`、`adim.pinduoduo.com`，如果这些也开始报证书错误，先关模块再排查。

## 直播流测试怎么用

请求记录里看到过 `pull-flv-l1.douyincdn.com/stage/stream-…flv` 的持续下载，还有把域名写进 URL 路径的 IPv4 写法。测试模块两种都会挡，但不封 CDN IP。

这条通道也跑正常的抖音直播，所以不能说它就是广告接口。

1. 先确认增强版 r8 工作正常，再开直播流测试
2. 强制退出番茄，进阅读页翻页，先别点进直播间
3. 看直播卡片还在不在播，同时在最近请求里看 `pull-flv-l1` 有没有被拒绝
4. 如果视频停了但卡片还在，说明只挡住了视频流，广告入口本身还在
5. 测完关掉模块

## 提交诊断记录

发请求记录时，最好带上请求详情里的域名、路径、命中的规则和 MITM 备注。账号、Cookie、Token 和查询参数请遮住。只看到 DIRECT 或“已修改”标签，判断不了有没有拦住。

## 更新记录

- **r8**：删掉 5 条不会生效的重写（它们的域名已在 [Rule] 里整段拦截），合并了几条重复写法。拦截范围和 r7 一样。
- **r7**：参考其他番茄模块，加了三条直播入口和素材域名拦截。
- **r6**：`*novelapp.fqnovelvod.com` 撤出 MITM，并删掉对应的视频重写。
- **r5**：`*.snssdk.com`、`*.byteimg.com` 撤出 MITM，缩小到具体主机。
- **r4**：从 FanQieNovel 源文件移植重写规则，修正了 snssdk.com、byteimg.com 的点号转义。源文件里被注释掉的直播 .flv 规则没有移入。

## 参考

- [FanQieNovel 源文件](https://github.com/zqzess/rule_for_quantumultX/blob/master/QuantumultX/rewrite/FanQieNovel.qxrewrite)（快照 `9307684c73c474be442e602d5f55d5ba05633518`）
- [zqzess Surge 模块](https://github.com/zqzess/rule_for_quantumultX/blob/master/Surge/Module/FanQieNovel.sgmodule)
- [zirawell 番茄模块](https://github.com/zirawell/R-Store/blob/main/Rule/Surge/Adblock/App/F/%E7%95%AA%E8%8C%84%E5%B0%8F%E8%AF%B4/fanqie.sgmodule)
- [可莉番茄模块](https://github.com/Masamisuki/Tool/blob/main/iKeLee/%E7%95%AA%E8%8C%84%E5%B0%8F%E8%AF%B4%E5%8E%BB%E5%B9%BF%E5%91%8A.sgmodule)
- [最初参考的模块](https://yfamilys.com/module/fanqie.module)
- [番茄广告过滤规则](https://github.com/changzhaoCZ/fqnovel-adrules)
- Surge 手册：[MITM](https://manual.nssurge.com/http/mitm.html)、[URL 重写](https://manual.nssurge.com/http/url-rewrite.html)

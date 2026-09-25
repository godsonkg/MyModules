# 番茄小说去广告

提供两个 Surge iOS 模块，选一个安装。

| 版本 | 用途 | 要求 |
| --- | --- | --- |
| [轻量版](Fanqie_AdBlock_Lite.sgmodule) | 拦截几组广告域名 | Surge iOS 5.8+ |
| [增强版](Fanqie_AdBlock_Enhanced.sgmodule) | 增加广告接口、素材及视频路径拦截 | Surge iOS 5.9.1+，开启重写和 MITM |

## 安装与更新

在 Surge 的“模块”页面从 URL 安装：

- [轻量版安装地址](https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Fanqie/Fanqie_AdBlock_Lite.sgmodule)
- [增强版安装地址](https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Fanqie/Fanqie_AdBlock_Enhanced.sgmodule)

已安装的模块直接更新即可。增强版当前描述应显示 `2026.09.25-r4`；轻量版仍为 `2026.09.25-r3`。排查效果时，暂时关闭其他番茄去广告模块，只留一个。

使用规则模式。增强版还需要开启重写、MITM，并安装和信任 Surge 证书。模块只追加解密域名，不会替你开启开关或安装证书。更新后强制退出番茄小说，再打开测试。

## 先确认手机加载了哪一版

更新增强版后，在 Safari 地址栏输入：

`http://fanqie-check.invalid/?v=r4`

必须使用 `http://`。正常应显示：

> 番茄增强版 2026.09.25-r4 已加载；本机重写生效。这不代表 MITM 已成功，也不代表广告已拦截。

这是 Surge 在本机返回的文本，不是外部网站，也不上传数据。如果打不开，先核对模块版本、启用状态、重写开关，以及地址是否被改成了 HTTPS。不能单凭打不开就认定模块没加载。

这个检查只验证增强版的本机重写。域名规则是否命中，要看“最近请求”里的阻止记录；HTTPS 接口重写是否有效，还取决于 MITM。

## r4 改了什么

r3 只补充了 TLS SNI / HTTP Host 扩展匹配，没有补足广告路径。用户反馈阅读插屏仍然出现。

r4 按用户提供的 Script Hub 链接，读取其 GitHub 源文件后重新移植。核对的源文件 SHA 为 `9307684c73c474be442e602d5f55d5ba05633518`。修正了原正则中 `byteimg.com`、`snssdk.com` 的点号转义，其余保留原有路径范围。内容如下：

- 恢复用户提供的 FanQieNovel 源文件中全部 16 条有效重写，转换为 Surge 原生格式，无需再经过 Script Hub。源文件开头三条 `#DOMAIN` 是注释，没有作为有效规则导入。
- `snssdk.com` 子域名下的 `/api/ad/` 广告接口和源规则中的视频播放路径。
- `pstatp.com` 下的广告素材、渲染资源和带 `from=ad` 参数的素材路径。
- `byteimg.com` 下的特定广告图片及广告素材目录。
- `novelapp.fqnovelvod.com` 视频路径和 `adim.pinduoduo.com` 的 toutiao 路径，以及源文件中的 `track_log` 上报路径。上报拦截本身不代表能去掉广告。
- 配套 MITM 域名及本机版本检查入口。

规则和路径样例已做静态检查。尚未用手机实测确认 r4 能去掉当前版本的阅读插屏，不承诺所有广告都会消失。

## 影响范围

Surge iOS 的这些规则会作用于整台设备。穿山甲广告、字节系 App 的部分广告和视频，以及主动看广告领奖励的功能都可能受影响。视频规则也可能拦住同接口的正常视频。

增强版对 `*.snssdk.com`、`*.pstatp.com`、`*.byteimg.com`、`*novelapp.fqnovelvod.com` 和 `adim.pinduoduo.com` 添加解密域名，比 r3 的解密范围更广。源文件有 snssdk 和 byteimg 的 HTTPS 重写，但其 hostname 列表没有完整覆盖这两组域名，r4 一并补齐。其他 App 使用这些地址时也会经过 MITM；若应用不接受 Surge 证书，可能连接失败。遇到图片、视频或正文加载异常，先关闭增强版核对。

没有整域拒绝 `bytedance.com`、`zijieapi.com`、`pstatp.com` 或 `byteimg.com`，也没有按截图中的共享 CDN IP 加封禁。截图出现 DIRECT，不足以判定该连接是广告。

## 仍有广告时

记录从打开番茄小说到插屏出现的整段请求。广告可能提前加载，只截出现后几秒容易漏掉下载请求。

优先查看相关连接的详情：目标地址、TLS SNI、完整路径、命中规则、收发流量。模块的拒绝结果通常显示“阻止 / REJECT”，不需要像响应脚本一样显示“已修改”。如果是 HTTP 重写拒绝，也可查看请求详情的重写说明。

分享记录前遮住账号、Cookie、Token 和 URL 查询参数。模块不修改会员状态。

## 参考

- [用户提供的原模块](https://yfamilys.com/module/fanqie.module)
- [FanQieNovel 视频及素材规则](https://github.com/zqzess/rule_for_quantumultX/blob/master/QuantumultX/rewrite/FanQieNovel.qxrewrite)
- [番茄广告过滤规则](https://github.com/changzhaoCZ/fqnovel-adrules)
- [Surge 域名规则](https://manual.nssurge.com/rules/domain.html)
- [Surge URL 重写](https://manual.nssurge.com/http/url-rewrite.html)
- [Surge Map Local](https://manual.nssurge.com/http/map-local.html)

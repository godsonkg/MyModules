# 番茄小说去广告

提供两个 Surge iOS 模块，**选一个安装即可**。需要 Surge iOS 5.8 或更新版本。

| 版本 | 规则 | 需要 MITM |
| --- | --- | --- |
| [轻量版](Fanqie_AdBlock_Lite.sgmodule) | 拦截常见广告域名 | 不需要 |
| [增强版](Fanqie_AdBlock_Enhanced.sgmodule) | 拦截穿山甲广告服务及素材域名，再处理部分广告接口 | 需要 |

先试轻量版。如果章末广告还在，可以关闭轻量版，换增强版试试。两个版本不要同时启用。

## 安装

在 Surge 的“模块”页面选择“从 URL 安装”，粘贴对应地址：

- 轻量版：`https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Fanqie/Fanqie_AdBlock_Lite.sgmodule`
- 增强版：`https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Fanqie/Fanqie_AdBlock_Enhanced.sgmodule`

增强版还需要在 Surge 中开启 MITM，生成并信任 Surge 证书。模块只给 `reading-hl.snssdk.com`、`i-hl.snssdk.com`、`gurd.snssdk.com` 添加解密规则。如果开启后小说内容加载异常，关掉增强版，改用轻量版。

## 2026.09.25-r3 更新

两个版本的域名规则都加上了 `extended-matching`。应用直接连接 IP 时，Surge 也会用 TLS SNI 和 HTTP Host 中的域名匹配规则。此前的规则没有启用这项匹配，存在漏拦的可能。

这次修正了匹配方式，尚未在手机上验证阅读插屏广告是否消失。已有截图中的资源 CDN 和日志连接不足以确定广告来源，因此这次没有新增屏蔽域名。

更新后，模块描述应显示 `2026.09.25-r3`，每条域名规则末尾应有 `extended-matching`。在 Surge 中更新已安装的模块，再强制退出并重开番茄小说。域名拦截需要使用“规则模式”；全局直连或全局代理模式不会按这份域名规则处理。

## 使用说明

模块只处理网络请求，不改会员状态。广告是否能拦住，取决于番茄小说当前版本实际使用的接口；开屏、正文和章末广告不一定全部消失。主动观看广告领取奖励的功能也可能受影响。

Surge iOS 的这类规则不能只限定番茄小说。增强版会拒绝整台设备对 `pangolin-sdk-toutiao.com` 和 `pglstatp-toutiao.com` 及其子域名的请求；其他使用同一广告服务的 App 也可能受影响。遇到异常时，先关闭模块重试。增强版如果没有完成 MITM 证书设置，URL 重写部分不会生效。

如果广告仍在，查看“最近请求”中从打开番茄小说到广告出现的整段记录，包含广告出现前的请求。视频可能提前下载，仅看弹出广告后几秒的记录容易漏掉来源。记下域名、路径、时间和匹配结果；点开显示“IP（域名）”的连接，还可查看目标地址、SNI 和命中规则。

分享截图前请遮住账号、Cookie、Token 和 URL 查询参数。出现 DIRECT 只说明该连接直连，不能单凭它认定模块未启用或该域名就是广告。资源 CDN 和日志上报连接也不能直接当作广告投放接口。若仍未找到匹配请求，需要继续查接口、正文响应或本地缓存。

规则参考：[番茄广告过滤规则](https://github.com/changzhaoCZ/fqnovel-adrules)、[公开的番茄模块](https://yfamilys.com/module/fanqie.module)。本仓库保留了广告相关的有限规则，没有加入整域屏蔽 `bytedance.com` 或强制 `byteimg.com` 直连的规则。

匹配参数说明：[Surge 域名规则](https://manual.nssurge.com/rules/domain.html)、[规则模式说明](https://manual.nssurge.com/rules/overview.html)。

# 番茄小说去广告

提供两个 Surge iOS 模块，**选一个安装即可**。

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

## 使用说明

模块只处理网络请求，不改会员状态。广告是否能拦住，取决于番茄小说当前版本实际使用的接口；开屏、正文和章末广告不一定全部消失。主动观看广告领取奖励的功能也可能受影响。

Surge iOS 的这类规则不能只限定番茄小说。增强版会拒绝整台设备对 `pangolin-sdk-toutiao.com` 和 `pglstatp-toutiao.com` 及其子域名的请求；其他使用同一广告服务的 App 也可能受影响。遇到异常时，先关闭模块重试。增强版如果没有完成 MITM 证书设置，URL 重写部分不会生效。

如果广告仍在，先在 Surge 的模块页面检查增强版是否已更新；再强制退出番茄小说，重新进入阅读页或翻到下一章，同时查看“最近请求”。记录广告出现时的域名、路径、时间和匹配结果。分享截图前请遮住账号、Cookie、Token 和 URL 查询参数。若“最近请求”里没有任何请求命中，不能继续按猜测扩大屏蔽范围；可能是接口换了、广告来自正文响应，或广告已在本地缓存。

规则参考：[番茄广告过滤规则](https://github.com/changzhaoCZ/fqnovel-adrules)、[公开的番茄模块](https://yfamilys.com/module/fanqie.module)。本仓库保留了广告相关的有限规则，没有加入整域屏蔽 `bytedance.com` 或强制 `byteimg.com` 直连的规则。

# 番茄小说去广告

提供两个 Surge iOS 模块，**选一个安装即可**。

| 版本 | 规则 | 需要 MITM |
| --- | --- | --- |
| [轻量版](Fanqie_AdBlock_Lite.sgmodule) | 拦截常见广告域名 | 不需要 |
| [增强版](Fanqie_AdBlock_Enhanced.sgmodule) | 在轻量版基础上，增加部分广告接口拦截 | 需要 |

先试轻量版。如果章末广告还在，可以关闭轻量版，换增强版试试。两个版本不要同时启用。

## 安装

在 Surge 的“模块”页面选择“从 URL 安装”，粘贴对应地址：

- 轻量版：`https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Fanqie/Fanqie_AdBlock_Lite.sgmodule`
- 增强版：`https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Fanqie/Fanqie_AdBlock_Enhanced.sgmodule`

增强版还需要在 Surge 中开启 MITM，生成并信任 Surge 证书。模块只给 `reading-hl.snssdk.com`、`i-hl.snssdk.com`、`gurd.snssdk.com` 添加解密规则。如果开启后小说内容加载异常，关掉增强版，改用轻量版。

## 使用说明

模块只处理网络请求，不改会员状态。广告是否能拦住，取决于番茄小说当前版本实际使用的接口；开屏、正文和章末广告不一定全部消失。主动观看广告领取奖励的功能也可能受影响。

Surge iOS 的这类规则不能只限定番茄小说。其他 App 如果使用同一广告主机，也会受到影响。遇到异常时，先关闭模块重试，再到 Surge“最近请求”查看被拒绝的域名。增强版如果没有完成 MITM 证书设置，URL 重写部分不会生效。

规则参考：[番茄广告过滤规则](https://github.com/changzhaoCZ/fqnovel-adrules)、[公开的番茄模块](https://yfamilys.com/module/fanqie.module)。本仓库保留了广告相关的有限规则，没有加入整域屏蔽 `bytedance.com` 或强制 `byteimg.com` 直连的规则。

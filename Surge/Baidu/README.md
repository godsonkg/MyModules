# 百度 App 去广告

| 模块 | 版本 | 说明 |
| --- | --- | --- |
| [轻量版](BaiduApp_AdBlock_Lite.sgmodule) | 2026.11.01-r2 | 只拦广告专用域名、广告素材和 HTTPDNS，不用 MITM |

## 安装

Surge →「模块」→「从 URL 安装」：

```
https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Baidu/BaiduApp_AdBlock_Lite.sgmodule
```

版本要求：Surge iOS 5.8+，在规则模式下用。装好后强制退出百度 App 再打开。

## 能挡住什么

- **开屏广告**：百度系 App 的开屏、插屏广告从 `afd.baidu.com` 下发，素材视频在 `fcvbjbcebos.baidu.com`、`nadvideo2.baidu.com`
- **广告素材**：推广图片 `ecma` / `ecmb` / `ecmc.bdimg.com`；广告视频的备用地址 `*.jomoxc.com`（见下）
- **百度联盟广告**：`mobads`、`pos`、`cpro`，包括其他 App 里的百度广告 SDK 和网页上的百度联盟广告
- **HTTPDNS**：百度 App 会用 `httpdns.baidubce.com` / `180.76.76.200` 自己解析域名。挡掉后它改用系统 DNS，Surge 的域名规则才能匹配上

## 挡不住什么

**首页信息流里的广告挡不住。** 百度 App 首页“推荐”里的广告和正常内容是同一个接口（`mbd.baidu.com`）一起下发的，这个域名还承载搜索、登录和整个信息流，不能整个拦。要去掉这类广告，得 MITM `mbd.baidu.com` 再改响应内容，需要先抓包看清格式。

**搜索结果页里的推广挡不住。** 结果页是 `m.baidu.com` 的网页，推广条目夹在正常结果里，同样要 MITM 后改页面内容。

### 关于 jomoxc.com

r1 装上后打开百度仍有京东弹窗。请求记录里，弹窗出现时 `<一串十六进制>.jomoxc.com:9082` 下载了 474 KB，是那一屏最大的一笔。车来了模块的参考作者也观察到：百度广告视频的主地址 `nadvideo2.baidu.com` 被拦后，SDK 会改从 `jomoxc.com` 拉同一个文件。

`jomoxc.com` 是百度自己的边缘节点（v2fly 域名表把它和 `jomodns` 一起归在百度下），**也可能承载百度 App 里的正常视频**。如果拦了之后信息流视频、好看视频放不出来，在模块里删掉 `jomoxc.com` 那一行就行。

**开屏可能还会出现一次。** 百度 App 会缓存上次拉到的开屏素材，挡住 `afd` 后可能还会再播一次缓存。清缓存或重装后就不会了。

## 为什么没有增强版

我在 GitHub 上找了一圈（2026-11-01），没有找到在维护的百度 App 专用规则：

- 能找到的大多是百度网盘、贴吧、地图、输入法、翻译这些单独 App 的
- zirawell、blackmatrix7 合集里有几条百度 App 的重写（`mbd.baidu.com/newspage/api/getmobads`、`afd.baidu.com/afd/entry`、`cover.baidu.com/.../dspSwitchAds`），但对应主机都不在它们的 MITM 列表里，HTTPS 下实际不会生效
- fmz200 的百度模块把 100 多个 `*.baidu.com` 子域整段拦掉，包括 `s.baidu.com`、`e.baidu.com`、`feed.baidu.com`、`baidustatic.com`，还有 `^https?://log.+?baidu\.com` 这种宽泛重写，误伤面太大
- 可莉的“百度网页去广告”只处理 Safari 里打开的百度首页，百度 App 首页是原生界面，用不上

没有抓包就写 `mbd.baidu.com` 的重写，很容易把信息流或搜索弄坏，所以先只出轻量版。

## 想要增强版的话

用 Surge 抓一段百度 App 的请求（开 MITM `mbd.baidu.com`、`m.baidu.com`），覆盖：冷启动开屏、首页刷几屏信息流、搜一次关键词、点开一条推广。导出请求记录发我，遮住账号、Cookie、Token 和 BDUSS。看到广告字段后再写增强版。

注意：如果开 MITM 后百度 App 直接断网或请求记录里出现 `MitM Failed`，说明百度做了证书固定，那就只能用轻量版了。

## 已知问题

**整台设备生效。** `afd`、`mobads`、`pos` 是百度系共用的广告域名，百度地图、网盘、贴吧的开屏也会一起被挡，其他 App 里的百度广告 SDK 也会被挡，“看广告领奖励”可能会失败。

**和车来了模块有重叠。** `mobads`、`pos`、`nadvideo2` 两个模块都有，同时开没有问题。

## 故意没拦

- `mbd.baidu.com`、`m.baidu.com`、`www.baidu.com`：百度 App 主接口和搜索页
- `*.bdstatic.com`、`*.bdimg.com`：百度的静态资源 CDN，页面样式和图片都在上面
- `als.baidu.com`、`nsclick.baidu.com`、`hm.baidu.com` 这类统计上报：属于统计，不是广告；有的页面依赖它们跳转
- `sofire.baidu.com`：百度的安全风控 SDK，拦了可能登录失败
- `t1x.baidu.com` 这类数字子域：有的是百度图片缩略图
- `180.76.76.76`：百度公共 DNS，不是 HTTPDNS
- `hectorstatic.baidu.com`：有的广告列表拦它，但也有去广告规则专门放行，百度 App 的动态模块可能在上面
- `a1.alibabausercontent.com`：阿里通用 CDN，淘宝小程序等也在用

## 更新记录

- **r2**：打开百度仍有京东弹窗，按请求记录补上推广图片 `ecma` / `ecmb` / `ecmc.bdimg.com` 和广告视频备用地址 `jomoxc.com`。
- **r1**：首个版本，只有域名规则。

## 参考

- [fmz200 百度模块](https://github.com/fmz200/wool_scripts/blob/main/Surge/module/split/partB/Baidu.sgmodule)
- [zirawell 全 App 重写合集](https://github.com/zirawell/R-Store/blob/main/Rule/QuanX/Adblock/All/rewrite/appAdRewrite.conf)（“百度系 - BAIDU”一节）
- [KiceHub 百度系](https://github.com/KiceHub/QX/blob/main/Rewrite/baidu.conf)（HTTPDNS 地址）
- [可莉 百度网页去广告](https://github.com/KIDA-MNESIA/gadgets/blob/main/module/kelee/BaiduSearchWebpage_remove_ads.sgmodule)（镜像）

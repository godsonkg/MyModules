# MyModules

自己用的 Surge 模块、脚本和规则，外加一个检查代理配置的小工具。

| 内容 | 文件 | 用途 |
| --- | --- | --- |
| AI 节点监测 | `AI-Check.sgmodule` | 面板：ChatGPT、Claude 实际出口 IP 和类型，Gemini 能不能用 |
| 节点 IP 质量检测 | `Surge/IPQuality.sgmodule` | 面板：指定节点的 IP 类型、流媒体和 AI 解锁情况 |
| 广东油价 | `Surge/GD_FuelPrice.sgmodule` | 面板：广东油价，每天自动更新 |
| 番茄小说去广告 | `Surge/Fanqie/` | 轻量版 / 增强版，见[单独说明](Surge/Fanqie/README.md) |
| Gemini 分流规则 | `Surge/Gemini.list` | Gemini、AI Studio、NotebookLM 等 Google AI 域名 |
| YouTube 解锁检测 | `Scripts/unlock_probe.js` | 独立脚本，用法写在文件开头 |
| 配置体检 | `tools/proxy_health/` | 检查 Surge/Loon 配置，见[使用说明](tools/proxy_health/README.md) |

模块都在 Surge →「模块」→「从 URL 安装」里添加。iOS 上也可以用 `surge:///install-module?url=` 加模块链接一键安装。

## AI 节点监测

```
https://raw.githubusercontent.com/godsonkg/MyModules/main/AI-Check.sgmodule
```

请求按你现有的规则分流，所以看到的就是 chatgpt.com、claude.ai、gemini.google.com 实际走的节点：

- ChatGPT / Claude：出口 IP、归属、运营商、IP 类型（住宅 / 数据中心 / 代理 / 移动），出口在两家都不支持的地区（如 HK、CN、RU）会标出来
- Gemini：读网页里的可用标记，显示“可用 / 地区不支持 / 未确认”和地区码

点面板刷新，不会自动跑。

## 节点 IP 质量检测

```
https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/IPQuality.sgmodule
```

和上一个的区别是可以指定节点：安装时把 `policy` 填成 Surge 里的节点或策略组名（区分大小写）。检测内容包括出口 IP 和类型，Netflix、YouTube Premium、Disney+，以及 ChatGPT、Claude、Gemini。`mask=true` 会把 IP 打码，方便截图。

“纯净度”是按 ip-api.com 返回的 IP 类型给的粗略分数，只能参考。

## 广东油价

```
https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/GD_FuelPrice.sgmodule
```

面板效果：

```
广东油价
更新时间：2026-09-24
92#: 8.63 元/升
95#: 9.35 元/升
98#: 11.00 元/升
0# 柴油: 8.31 元/升
口径：92#/95#/柴油为广东省最高零售价；98#暂沿用最近一次广州参考价
来源：广东省发改委最高零售价；98#为广州参考价
提示：加油站实际售价可能不同
```

92#、95#、0# 柴油取自广东省发改委公布的最高零售价，98# 取广州参考价。GitHub Actions 每天北京时间 8:20 抓取、校验，价格变了才提交 `data/guangdong_fuel.json`。

面板每小时自动刷新一次，用缓存；手动点按会跳过缓存重新拉取。拉取失败时显示上次的缓存，并注明是缓存；从来没拉成功过就只提示失败，不会显示编造的价格。

可以在模块里改的：

- `update-interval`：自动刷新间隔，秒
- `ttl`：缓存时长，秒
- `province`：面板标题里的省份名，只影响显示

加油站实际价格会因品牌、会员和活动不同。数据只有广东，换省份要自己准备 JSON。

### JSON 格式

```json
{
  "province": "广东",
  "updated_at": "2026-09-24",
  "unit": "元/升",
  "price_type": "价格口径说明",
  "items": [
    { "name": "92#", "price": 8.63 },
    { "name": "95#", "price": 9.35 },
    { "name": "98#", "price": 11.0 },
    { "name": "0# 柴油", "price": 8.31 }
  ],
  "source": "数据来源说明"
}
```

`items` 至少 4 项，每个价格要在 4–20 之间，否则脚本当作异常数据丢掉。`price_type`、`source` 为空时面板不显示对应行。

## Gemini 分流规则

```
RULE-SET,https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/Gemini.list,你的策略组
```

域名整理自 v2fly/domain-list-community 的 `google-deepmind` 列表。2026-09-25 之前的版本带了 `googleapis.com` 和 `googleusercontent.com` 整段后缀，会把 YouTube、Google Play、地图等请求也分到 Gemini 策略里，现在去掉了。Google 的其他域名交给你配置里的 Google 规则。

`Surge/Gemini`（无扩展名）是旧文件，内容和 `Gemini.list` 相同，保留是为了不让旧链接失效。

## 目录

```
MyModules/
├─ AI-Check.sgmodule / AI-Check.js   AI 节点监测
├─ Surge/
│  ├─ IPQuality.sgmodule             节点 IP 质量检测
│  ├─ GD_FuelPrice.sgmodule          广东油价
│  ├─ Gemini.list                    Gemini 规则（Gemini 为旧文件名）
│  └─ Fanqie/                        番茄小说去广告
├─ Scripts/
│  ├─ ipquality_surge.js
│  ├─ gd_fuel_price.js
│  ├─ unlock_probe.js                YouTube 解锁检测
│  ├─ update_fuel.py                 油价抓取（Actions 调用）
│  └─ test_update_fuel.py
├─ data/guangdong_fuel.json          油价数据
└─ tools/proxy_health/               配置体检工具
```

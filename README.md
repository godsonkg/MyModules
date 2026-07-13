# 广东油价查看（Surge 面板模块）

在 Surge 的面板（Dashboard）上显示广州成品油参考指导价（92# / 95# / 98# / 0# 柴油）。加油站实际售价会因品牌、会员优惠和活动不同而有差异。
价格数据存放在本仓库的 JSON 文件中，并由 GitHub Actions 定时**自动更新**，你无需手动维护。

> 这是一个开箱即用的模块：直接安装下面的链接即可，不需要自己建仓库或改任何配置。

## 面板效果

```
广东油价
更新时间：2026-07-13
92#: 7.20 元/升
95#: 7.80 元/升
98#: 9.80 元/升
0# 柴油: 6.83 元/升
口径：参考指导价
来源：广州油价页
提示：加油站实际售价可能不同
```

## 安装（在 Surge 中添加）

1. 打开 Surge → **Modules（模块）** → **Install from URL（从链接安装）**。
2. 粘贴下面的模块链接：

```
https://raw.githubusercontent.com/godsonkg/MyModules/main/Surge/GD_FuelPrice.sgmodule
```

3. 安装并启用后，回到 **Dashboard（面板）** 即可看到「广东油价」。

> 提示：iOS 上也可以直接用 `surge:///install-module?url=` 加上面的链接一键安装。

## 数据从哪里来？

模块里的脚本会拉取本仓库的 JSON 数据文件：

```
https://raw.githubusercontent.com/godsonkg/MyModules/main/data/guangdong_fuel.json
```

该 JSON 由仓库内的 **GitHub Actions 工作流每天抓取并校验**。只有价格发生变化时才提交更新，面板默认缓存 1 小时。数据口径是参考指导价，不代表某一家加油站的实时成交价。
为保证稳定，脚本还内置了两层兜底：**本地缓存**（上次成功的数据）和**离线兜底**（万一网络不通时显示）。

## 自定义

模块的行为由 `Surge/GD_FuelPrice.sgmodule` 控制，常用可调项：

- **刷新间隔**：修改 `[Panel]` 里的 `update-interval`（单位：秒，默认 `3600` = 1 小时）。
- **缓存时长**：修改 `[Script]` argument 里的 `ttl`（单位：秒）。
- **展示省份名**：修改 argument 里的 `province=广东`（仅影响面板标题文字）。
- **样式**：在脚本 `fmt()` 里可调整 `icon`、`icon-color`、标题与字段排版。

## JSON 字段说明

```json
{
  "province": "广东",
  "updated_at": "2026-07-13",
  "unit": "元/升",
  "items": [
    { "name": "92#", "price": 7.20 },
    { "name": "95#", "price": 7.80 },
    { "name": "98#", "price": 9.80 },
    { "name": "0# 柴油", "price": 6.83 }
  ],
  "price_type": "参考指导价",
  "source": "广州油价页（参考指导价；加油站实际价可能不同）"
}
```

- `items` 可按需增减条目（例如加入「95# 国VI」等）。
- `unit` 会拼接在每个价格后面显示。
- `source` 为空时面板不显示「来源」行。

## 目录结构

```
MyModules/
├─ Surge/
│  └─ GD_FuelPrice.sgmodule   # Surge 模块（面板 + 脚本定义）
├─ Scripts/
│  ├─ gd_fuel_price.js        # 拉取并格式化油价的面板脚本
│  └─ update_fuel.py          # 抓取并校验广州参考指导价
└─ data/
   └─ guangdong_fuel.json     # 油价数据（由 Actions 自动更新）
```

## 常见问题

**面板不更新 / 一直是旧价格？**
默认缓存为 1 小时，可在 Surge 面板下拉刷新，或把 `update-interval` / `ttl` 调小。
若 GitHub Raw 访问受限，可能拉取失败，此时面板会显示缓存或内置示例。

**为什么和某个加油站的价格不一样？**
面板展示的是城市参考指导价，不是单站成交价。品牌、会员、支付渠道和限时活动都会让实际站价上下浮动。

**面板显示「离线内置」数据？**
说明脚本没能成功拉到数据（多为网络不通或 Raw 被限制）。网络恢复后刷新面板即可。

**想看别的省份？**
本模块的数据源只包含广东。换省需要同时替换数据 JSON 并把 `province` 改成对应名称。

祝使用愉快！

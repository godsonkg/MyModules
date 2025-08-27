
# 广东油价查看（Surge 面板模块）

面向新手的最小可用案例。你把这个仓库结构上传到 GitHub，就能在 Surge 里添加 `.sgmodule` 的 Raw 链接，直接显示“广东油价”面板。

## 目录结构
```
MyModules/
├─ Surge/
│  └─ GD_FuelPrice.sgmodule
├─ Scripts/
│  └─ gd_fuel_price.js
└─ data/
   └─ guangdong_fuel.json   # 示例数据（可先用；之后可改为你自己的数据源）
```

## 快速开始（建议用电脑操作）
1. **新建仓库**
   - 打开 GitHub，右上角 `+` → New repository  
   - 仓库名建议：`MyModules`（也可以别的）

2. **上传本项目文件**
   - 把 `Surge/`、`Scripts/`、`data/` 整个上传到仓库根目录。

3. **修改占位符**
   - 打开 `Surge/GD_FuelPrice.sgmodule`，把里面的 `<your_github_username>` 和仓库名改成你自己的。
   - 如果你仓库不是 `MyModules`，也要同步改路径。

4. **拿到 Raw 订阅链接**
   - 进入 GitHub 仓库 → `Surge/GD_FuelPrice.sgmodule`
   - 点开文件 → 点击右上角 **Raw**，复制浏览器地址（就是订阅链接）。

5. **在 Surge 添加模块**
   - `Surge → Modules → Install from URL`  
   - 粘贴上一步复制的 Raw 链接。安装后，在面板（Dashboard）就能看到“广东油价”。

## 数据从哪里来？
- 默认脚本去拉取：  
  `https://raw.githubusercontent.com/<your_github_username>/MyModules/main/data/guangdong_fuel.json`  
- 你可以手动更新这个 JSON（比如每天换一次），面板会自动刷新（默认 6 小时缓存）。
- 为了稳定，脚本还内置了：**缓存**（上次成功的数据）与**离线示例**（万一网络不通或链接写错）。

## 定制
- 想缩短刷新间隔？改 `.sgmodule` 里的 `update-interval` 和 `ttl`。
- 想展示别的省？把 `province=广东` 改成别的，同时把 JSON 的 `province` 字段换成对应名称。
- 你也可以把脚本的 `icon-color`、标题、字段名改成自己的风格。

## JSON 字段说明
```json
{
  "province": "广东",
  "updated_at": "2025-08-27 08:00:00",
  "unit": "元/升",
  "items": [
    { "name": "92#", "price": 8.32 },
    { "name": "95#", "price": 9.00 },
    { "name": "98#", "price": 10.20 },
    { "name": "0# 柴油", "price": 8.00 }
  ],
  "source": "数据来源说明"
}
```
- `items` 里面你可以按需增减条目（比如 `95# 国VI`）。

## 常见问题
- **Raw 链接访问不到 / 面板不更新？**  
  检查 `.sgmodule` 里的用户名和仓库路径是否正确；有时候网络环境会限制 GitHub Raw，可考虑镜像或自建 JSON。

- **显示的是内置示例，不是我自己的价格？**  
  说明脚本没能成功拉到你的 JSON：要么路径错了，要么网络不通。修好后等一会儿（或手动点下刷新面板）。

- **想不依赖手动改 JSON，能否自动抓取？**  
  可以，后续我们可以把“来源”换成你能稳定访问的公开 API 或你自己的小服务端，再加上简单的解析。

祝使用愉快！

# Proxy Health Checker

Surge/Loon 配置的只读健康检查器。它在配置同步到手机前检查规则顺序、策略引用、敏感信息和指定域名的最终路由，不参与代理转发，也不会自动修改原配置。

## 功能

- 解析 Surge/Loon 的 `[Proxy]`、`[Proxy Group]`、`[Remote Proxy]` 和 `[Rule]`
- 检查不存在的策略组、重复或冲突规则、`FINAL/MATCH` 后的无效规则
- 识别宽泛 `DOMAIN-SUFFIX` / `DOMAIN-KEYWORD` 对后续具体规则的遮蔽
- 扫描订阅 Token、节点 URI、MITM 证书及密码、SSID 等隐私风险
- 用 JSON 用例执行域名路由回归测试
- 比较同一域名在 Surge 与 Loon 中的模拟路由差异
- 输出纯文本、Markdown 或 JSON 报告

检查器默认只输出问题类型、行号和策略名，绝不把匹配到的 Token、密码、证书原文写入报告。

## 本地使用

需要 Python 3.10 或更高版本，不依赖第三方库。

```powershell
# 基础检查
python tools/proxy_health/proxy_health.py check "G:\config\Loon_VK.conf"

# 生成 Markdown 报告
python tools/proxy_health/proxy_health.py check "G:\config\Loon_VK.conf" `
  --format markdown --output proxy-health-report.md

# 上传公开仓库前，把敏感信息提升为阻断错误
python tools/proxy_health/proxy_health.py check "G:\config\Loon_VK.conf" `
  --secret-level error

# 路由回归测试
python tools/proxy_health/proxy_health.py test "G:\config\Loon_VK.conf" `
  tools/proxy_health/examples/route-tests.json

# 比较 Surge 与 Loon
python tools/proxy_health/proxy_health.py compare "G:\config\Surge.conf" `
  "G:\config\Loon.conf" tools/proxy_health/examples/route-tests.json
```

退出码：`0` 表示达到设定门槛，`1` 表示发现需要阻止发布的问题，`2` 表示文件或命令错误。默认仅错误导致退出码 `1`；加 `--fail-on warning` 可让警告也阻止发布，加 `--fail-on never` 可始终生成报告而不失败。

真实代理配置本身通常含节点密码，所以敏感信息默认记为警告并按类型合并，避免本地体检产生大量重复错误。准备上传公开仓库时使用 `--secret-level error`；不需要隐私扫描时可使用 `--secret-level off`。

## 路由测试格式

测试文件使用 JSON，避免额外安装 YAML 库：

```json
{
  "cases": [
    { "host": "qidian.com", "expect": "DIRECT" },
    { "host": "api.openai.com", "expect": "AI" },
    {
      "host": "www.youtube.com",
      "expect_surge": "Media",
      "expect_loon": "Media"
    }
  ]
}
```

`test` 使用 `expect`；`compare` 优先使用 `expect_surge` / `expect_loon`，未提供时回退到 `expect`。

## 当前边界

- 第一版只模拟 `DOMAIN`、`DOMAIN-SUFFIX`、`DOMAIN-KEYWORD` 与 `FINAL/MATCH`。
- `RULE-SET` / `DOMAIN-SET` 不会自动下载；它们出现在测试域名前时，报告会标记 `ROUTE_UNCERTAIN`，避免把不完整模拟误报为确定结论。
- IP、进程名、User-Agent、GeoIP 和脚本规则暂不参与域名模拟，但仍保留在语法和策略引用检查范围内。
- 检查器不会上传配置。公开仓库建议只放检查器和脱敏样例；真实配置应留在本地或私人仓库。

## 自动测试

仓库中的 `.github/workflows/proxy_health.yml` 会在相关文件变更时运行单元测试，并检查两份脱敏样例。真实配置不会被 Actions 自动读取。

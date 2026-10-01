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

报告里只有问题类型、行号和策略名，不会写出匹配到的 Token、密码或证书原文。

## 本地使用

需要 Python 3.10 或更高版本，不依赖第三方库。

```powershell
# 基础检查
python tools/proxy_health/proxy_health.py check "path\to\Loon.conf"

# 生成 Markdown 报告
python tools/proxy_health/proxy_health.py check "path\to\Loon.conf" `
  --format markdown --output proxy-health-report.md

# 上传公开仓库前，把敏感信息提升为阻断错误
python tools/proxy_health/proxy_health.py check "path\to\Loon.conf" `
  --secret-level error

# 路由回归测试
python tools/proxy_health/proxy_health.py test "path\to\Loon.conf" `
  tools/proxy_health/examples/route-tests.json

# 比较 Surge 与 Loon
python tools/proxy_health/proxy_health.py compare "path\to\Surge.conf" `
  "path\to\Loon.conf" tools/proxy_health/examples/route-tests.json
```

退出码：`0` 表示达到设定门槛，`1` 表示发现需要阻止发布的问题，`2` 表示文件或命令错误。默认仅错误导致退出码 `1`；加 `--fail-on warning` 可让警告也阻止发布，加 `--fail-on never` 可始终生成报告而不失败。

真实配置里本来就有节点密码，所以敏感信息默认只记警告，并按类型合并，不然本地体检会刷出一堆重复错误。准备上传公开仓库时使用 `--secret-level error`；不需要隐私扫描时可使用 `--secret-level off`。

## 路由测试格式

测试文件用 JSON，省得再装 YAML 库：

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

- 目前只模拟 `DOMAIN`、`DOMAIN-SUFFIX`、`DOMAIN-KEYWORD` 与 `FINAL/MATCH`。
- `RULE-SET` / `DOMAIN-SET` 只通过显式 `--rule-map` 展开本地、SHA-256 锁定快照，不自动下载。缺失映射、嵌套规则和快照中不能模拟的条目仍保守标记 `ROUTE_UNCERTAIN`；不确定时不输出 `ROUTE_OK`。
- IP、进程名、User-Agent、GeoIP 和脚本规则暂不参与域名模拟，但仍保留在语法和策略引用检查范围内。
- 检查器不会上传配置。公开仓库建议只放检查器和脱敏样例；真实配置应留在本地或私人仓库。

## 自动测试

在仓库根目录运行单元测试：

```powershell
python -m unittest discover -s tools/proxy_health/tests -v
```

仓库中的 `.github/workflows/proxy_health.yml` 会在相关文件变更时运行单元测试，并检查两份脱敏样例。真实配置不会被 Actions 自动读取。

## 离线规则集检查（PikPak / Emby）

```sh
python tools/proxy_health/proxy_health.py test \
  tools/proxy_health/examples/external-rules.conf \
  tools/proxy_health/examples/external-route-tests.json \
  --rule-map tools/proxy_health/examples/rule-map.json --fail-on warning
```

样例快照取自你维护的公开规则仓库；映射记录原提交和 SHA-256。只代表该提交，不能代表远端 URL 当前内容。更新快照时人工审核内容并同步修改哈希。映射按规则类型和完整 URL 精确匹配，策略继承引用该规则集的配置行，先命中优先。

映射格式为 `{"version":1,"sets":[{"type":"RULE-SET","source":"https://example.invalid/rules.list","file":"snapshots/rules.list","sha256":"64位小写十六进制"}]}`。文件路径相对于映射文件，不能越出映射目录。每文件最多 2 MiB，仅 UTF-8。URL 不允许用户名、密码、查询参数或片段。不要把真实配置、订阅地址或凭据复制进快照。

`RULE-SET` 支持两列 DOMAIN / DOMAIN-SUFFIX / DOMAIN-KEYWORD；`DOMAIN-SET` 支持裸域名（精确匹配）和点开头的后缀匹配。遇到其他条目保留不确定性，不会静默忽略后宣称通过。Emby 快照含 PROCESS-NAME，因此其后命中的域名或最终默认路由可能标记不确定，这是预期行为。要将不确定结论阻断 CI，使用 `--fail-on warning`。

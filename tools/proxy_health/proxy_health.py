#!/usr/bin/env python3
"""Read-only health checks for Surge and Loon proxy configurations.

The checker deliberately reports only finding types, line numbers and policy
names. It never includes matched secret values in its output.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable, Sequence


VERSION = "0.1.0"
BUILTIN_POLICIES = {
    "DIRECT",
    "REJECT",
    "REJECT-DROP",
    "REJECT-NO-DROP",
    "REJECT-TINYGIF",
    "PROXY",
    "PASS",
    "CELLULAR",
    "HYBRID",
    "SYSTEM",
}
FINAL_TYPES = {"FINAL", "MATCH"}
REMOTE_RULE_TYPES = {"RULE-SET", "DOMAIN-SET"}
DOMAIN_RULE_TYPES = {"DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD"}
TRAILING_RULE_OPTIONS = {"no-resolve", "extended-matching", "pre-matching"}
SEVERITY_ORDER = {"error": 0, "warning": 1, "info": 2}


@dataclass(frozen=True)
class Finding:
    severity: str
    code: str
    message: str
    line: int | None = None
    section: str | None = None


@dataclass(frozen=True)
class Entry:
    line: int
    text: str
    section: str


@dataclass(frozen=True)
class Rule:
    line: int
    kind: str
    value: str | None
    policy: str | None
    raw_parts: tuple[str, ...]


@dataclass
class ConfigModel:
    path: Path
    client: str
    encoding: str
    lines: list[str]
    sections: dict[str, list[Entry]] = field(default_factory=dict)
    section_order: list[tuple[str, int]] = field(default_factory=list)
    proxies: set[str] = field(default_factory=set)
    groups: set[str] = field(default_factory=set)
    remote_providers: set[str] = field(default_factory=set)
    rules: list[Rule] = field(default_factory=list)
    parse_findings: list[Finding] = field(default_factory=list)

    @property
    def policies(self) -> set[str]:
        return BUILTIN_POLICIES | self.proxies | self.groups | self.remote_providers


@dataclass(frozen=True)
class RouteResult:
    host: str
    policy: str | None
    line: int | None
    matched_by: str | None
    unresolved_remote_lines: tuple[int, ...] = ()


def read_text(path: Path) -> tuple[str, str]:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return raw.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    raise UnicodeError("配置文件无法按 UTF-8 或 GB18030 解码")


def detect_client(sections: Iterable[str], requested: str, lines: Sequence[str]) -> str:
    if requested != "auto":
        return requested
    lowered = {section.lower() for section in sections}
    if "remote proxy" in lowered or any(
        re.match(r"(?i)\s*(?:disable-stun|ssid-trigger)\s*=", line) for line in lines
    ):
        return "loon"
    if "proxy group" in lowered or "url rewrite" in lowered:
        return "surge"
    return "unknown"


def split_assignment_name(text: str) -> str | None:
    if "=" not in text:
        return None
    name = text.split("=", 1)[0].strip()
    return name or None


def parse_rule(entry: Entry) -> tuple[Rule | None, Finding | None]:
    try:
        parts = next(csv.reader([entry.text], skipinitialspace=True))
    except csv.Error:
        return None, Finding(
            "error", "RULE_CSV", "规则字段无法解析", entry.line, entry.section
        )
    parts = [part.strip() for part in parts if part.strip()]
    if len(parts) < 2:
        return None, Finding(
            "error", "RULE_FIELDS", "规则字段不足", entry.line, entry.section
        )

    kind = parts[0].upper()
    payload = list(parts[1:])
    while payload and (
        payload[-1].lower() in TRAILING_RULE_OPTIONS
        or payload[-1].lower().startswith("protocol=")
    ):
        payload.pop()

    if kind in FINAL_TYPES:
        policy = payload[0] if payload else None
        value = None
    else:
        policy = payload[-1] if len(payload) >= 2 else None
        value_parts = payload[:-1]
        value = ",".join(value_parts).strip() if value_parts else None

    if not policy:
        return None, Finding(
            "error", "RULE_POLICY", "规则缺少目标策略", entry.line, entry.section
        )
    return Rule(entry.line, kind, value, policy, tuple(parts)), None


def parse_config(path: Path, client: str = "auto") -> ConfigModel:
    text, encoding = read_text(path)
    lines = text.splitlines()
    sections: dict[str, list[Entry]] = {}
    section_order: list[tuple[str, int]] = []
    findings: list[Finding] = []
    current: str | None = None

    for number, raw_line in enumerate(lines, 1):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith(("#", ";", "//")):
            continue
        match = re.fullmatch(r"\[([^\]]+)\]", stripped)
        if match:
            current = match.group(1).strip()
            if current in sections:
                findings.append(
                    Finding(
                        "warning",
                        "SECTION_DUPLICATE",
                        f"区块 [{current}] 重复出现",
                        number,
                        current,
                    )
                )
            sections.setdefault(current, [])
            section_order.append((current, number))
            continue
        if current is None:
            findings.append(
                Finding(
                    "warning",
                    "OUTSIDE_SECTION",
                    "内容位于任何配置区块之外",
                    number,
                )
            )
            continue
        sections.setdefault(current, []).append(Entry(number, stripped, current))

    model = ConfigModel(
        path=path,
        client=detect_client(sections, client, lines),
        encoding=encoding,
        lines=lines,
        sections=sections,
        section_order=section_order,
        parse_findings=findings,
    )

    for section, entries in sections.items():
        normalized = section.lower()
        if normalized == "proxy":
            model.proxies.update(
                name for entry in entries if (name := split_assignment_name(entry.text))
            )
        elif normalized == "proxy group":
            model.groups.update(
                name for entry in entries if (name := split_assignment_name(entry.text))
            )
        elif normalized in {"remote proxy", "external proxy"}:
            model.remote_providers.update(
                name for entry in entries if (name := split_assignment_name(entry.text))
            )
        elif normalized == "rule":
            for entry in entries:
                rule, finding = parse_rule(entry)
                if finding:
                    model.parse_findings.append(finding)
                if rule:
                    model.rules.append(rule)

    if model.client == "unknown":
        model.parse_findings.append(
            Finding("warning", "CLIENT_UNKNOWN", "无法自动判断是 Surge 还是 Loon 配置")
        )
    if encoding == "gb18030":
        model.parse_findings.append(
            Finding("info", "ENCODING_GB18030", "文件使用 GB18030 编码")
        )
    return model


def secret_findings(model: ConfigModel, severity: str = "warning") -> list[Finding]:
    if severity == "off":
        return []
    findings: list[Finding] = []
    patterns = (
        (
            re.compile(r"(?i)\bca-p12\s*="),
            "SECRET_CA_P12",
            "检测到 MITM 证书数据，禁止提交到公开仓库",
        ),
        (
            re.compile(r"(?i)\bca-passphrase\s*="),
            "SECRET_CA_PASSWORD",
            "检测到 MITM 证书密码，禁止提交到公开仓库",
        ),
        (
            re.compile(r"(?i)(?:[?&]|\b)(?:token|secret|api[_-]?key|password|passwd|auth)=([^&\s]+)"),
            "SECRET_URL_PARAMETER",
            "检测到 URL 或参数中的凭据",
        ),
        (
            re.compile(r"(?i)\b(?:ss|ssr|vmess|vless|trojan|hysteria2?|tuic)://"),
            "SECRET_NODE_URI",
            "检测到可能包含节点凭据的 URI",
        ),
        (
            re.compile(r"(?i)https?://[^/\s:@]+:[^/\s@]+@"),
            "SECRET_BASIC_AUTH",
            "检测到 URL 内嵌用户名和密码",
        ),
    )
    placeholders = {"redacted", "example", "changeme", "placeholder", "<redacted>"}
    occurrences: dict[str, list[tuple[int, str | None, str]]] = {}
    current_section: str | None = None
    for number, raw_line in enumerate(model.lines, 1):
        stripped = raw_line.strip()
        header = re.fullmatch(r"\[([^\]]+)\]", stripped)
        if header:
            current_section = header.group(1).strip()
            continue
        if not stripped or stripped.startswith(("#", ";", "//")):
            continue
        for pattern, code, message in patterns:
            match = pattern.search(stripped)
            if (
                match
                and code == "SECRET_URL_PARAMETER"
                and match.lastindex
                and match.group(1).strip("'\"").casefold() in placeholders
            ):
                continue
            if match:
                occurrences.setdefault(code, []).append((number, current_section, message))
        if re.search(r"(?i)^ssid-trigger\s*=", stripped):
            findings.append(
                Finding(
                    "warning",
                    "PRIVACY_SSID",
                    "SSID 触发规则可能暴露私人网络名称",
                    number,
                    current_section,
                )
            )
        if re.search(r"(?i)^disable-stun\s*=\s*false\b", stripped):
            findings.append(
                Finding(
                    "warning",
                    "STUN_ENABLED",
                    "disable-stun=false，需确认是否接受 WebRTC/STUN 暴露风险",
                    number,
                    current_section,
                )
            )
    for code, matches in occurrences.items():
        number, section, message = matches[0]
        suffix = f"（同类共 {len(matches)} 处）" if len(matches) > 1 else ""
        findings.append(Finding(severity, code, message + suffix, number, section))
    return findings


def check_policy_references(model: ConfigModel) -> list[Finding]:
    findings: list[Finding] = []
    policies = {policy.casefold() for policy in model.policies}
    for rule in model.rules:
        if rule.policy and rule.policy.casefold() not in policies:
            findings.append(
                Finding(
                    "error",
                    "POLICY_MISSING",
                    f"规则引用了不存在的策略组或节点：{rule.policy}",
                    rule.line,
                    "Rule",
                )
            )
    return findings


def check_final_rules(model: ConfigModel) -> list[Finding]:
    finals = [index for index, rule in enumerate(model.rules) if rule.kind in FINAL_TYPES]
    findings: list[Finding] = []
    if not finals:
        findings.append(Finding("warning", "FINAL_MISSING", "未发现 FINAL/MATCH 兜底规则"))
        return findings
    if len(finals) > 1:
        for index in finals[1:]:
            findings.append(
                Finding(
                    "error",
                    "FINAL_MULTIPLE",
                    "存在多个 FINAL/MATCH 兜底规则",
                    model.rules[index].line,
                    "Rule",
                )
            )
    first = finals[0]
    for rule in model.rules[first + 1 :]:
        findings.append(
            Finding(
                "error",
                "RULE_AFTER_FINAL",
                "规则位于 FINAL/MATCH 之后，通常永远无法命中",
                rule.line,
                "Rule",
            )
        )
    return findings


def parent_suffixes(domain: str) -> list[str]:
    labels = domain.lower().strip(".").split(".")
    return [".".join(labels[index:]) for index in range(max(0, len(labels) - 1))]


def check_domain_rules(model: ConfigModel) -> list[Finding]:
    findings: list[Finding] = []
    exact: dict[tuple[str, str], Rule] = {}
    earlier_suffixes: dict[str, Rule] = {}
    earlier_keywords: list[Rule] = []

    for rule in model.rules:
        if rule.kind not in DOMAIN_RULE_TYPES or not rule.value:
            continue
        value = rule.value.lower().strip(".")
        key = (rule.kind, value)
        if key in exact:
            previous = exact[key]
            if previous.policy == rule.policy:
                findings.append(
                    Finding(
                        "warning",
                        "RULE_DUPLICATE",
                        f"规则与第 {previous.line} 行重复",
                        rule.line,
                        "Rule",
                    )
                )
            else:
                findings.append(
                    Finding(
                        "error",
                        "RULE_CONFLICT",
                        f"同一匹配条件与第 {previous.line} 行指向不同策略",
                        rule.line,
                        "Rule",
                    )
                )
        else:
            exact[key] = rule

        shadow: Rule | None = None
        if rule.kind in {"DOMAIN", "DOMAIN-SUFFIX"}:
            candidates = parent_suffixes(value)
            if rule.kind == "DOMAIN":
                candidates.append(value)
            for suffix in candidates:
                candidate = earlier_suffixes.get(suffix)
                if candidate and candidate.line < rule.line:
                    shadow = candidate
                    break
            if shadow is None:
                for keyword_rule in earlier_keywords:
                    if keyword_rule.value and keyword_rule.value.lower() in value:
                        shadow = keyword_rule
                        break

        if shadow and (shadow.kind, (shadow.value or "").lower().strip(".")) != key:
            severity = "error" if shadow.policy != rule.policy else "warning"
            findings.append(
                Finding(
                    severity,
                    "RULE_SHADOWED",
                    f"该规则可能被第 {shadow.line} 行的更宽泛规则提前命中",
                    rule.line,
                    "Rule",
                )
            )

        if rule.kind == "DOMAIN-SUFFIX" and value not in earlier_suffixes:
            earlier_suffixes[value] = rule
        elif rule.kind == "DOMAIN-KEYWORD":
            earlier_keywords.append(rule)
    return findings


def run_checks(model: ConfigModel, secret_level: str = "warning") -> list[Finding]:
    findings = list(model.parse_findings)
    findings.extend(secret_findings(model, secret_level))
    findings.extend(check_policy_references(model))
    findings.extend(check_final_rules(model))
    findings.extend(check_domain_rules(model))
    return sort_findings(findings)


def route_host(model: ConfigModel, host: str) -> RouteResult:
    normalized = host.lower().rstrip(".")
    unresolved: list[int] = []
    for rule in model.rules:
        if rule.kind in REMOTE_RULE_TYPES:
            unresolved.append(rule.line)
            continue
        value = (rule.value or "").lower().strip(".")
        matched = False
        if rule.kind == "DOMAIN":
            matched = normalized == value
        elif rule.kind == "DOMAIN-SUFFIX":
            matched = normalized == value or normalized.endswith("." + value)
        elif rule.kind == "DOMAIN-KEYWORD":
            matched = value in normalized
        elif rule.kind in FINAL_TYPES:
            matched = True
        if matched:
            return RouteResult(
                normalized,
                rule.policy,
                rule.line,
                rule.kind,
                tuple(unresolved),
            )
    return RouteResult(normalized, None, None, None, tuple(unresolved))


def load_route_cases(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    cases = data.get("cases") if isinstance(data, dict) else None
    if not isinstance(cases, list):
        raise ValueError("路由测试文件必须包含 cases 数组")
    for case in cases:
        if not isinstance(case, dict) or not case.get("host"):
            raise ValueError("每个路由测试必须包含 host")
    return cases


def run_route_cases(
    model: ConfigModel,
    cases: Sequence[dict],
    expect_key: str = "expect",
    label: str | None = None,
) -> list[Finding]:
    findings: list[Finding] = []
    prefix = f"[{label}] " if label else ""
    for case in cases:
        host = str(case["host"])
        expected = case.get(expect_key, case.get("expect"))
        result = route_host(model, host)
        if result.unresolved_remote_lines:
            lines = ", ".join(map(str, result.unresolved_remote_lines[:3]))
            findings.append(
                Finding(
                    "warning",
                    "ROUTE_UNCERTAIN",
                    f"{prefix}{host} 之前经过未展开的远程规则（行 {lines}），模拟结果可能不完整",
                    result.line,
                    "Rule",
                )
            )
        if expected is not None and result.policy != expected:
            actual = result.policy or "未匹配"
            findings.append(
                Finding(
                    "error",
                    "ROUTE_MISMATCH",
                    f"{prefix}{host} 预期 {expected}，实际 {actual}",
                    result.line,
                    "Rule",
                )
            )
        elif expected is not None:
            findings.append(
                Finding(
                    "info",
                    "ROUTE_OK",
                    f"{prefix}{host} 命中 {result.policy}（{result.matched_by}）",
                    result.line,
                    "Rule",
                )
            )
    return sort_findings(findings)


def compare_routes(
    surge: ConfigModel, loon: ConfigModel, cases: Sequence[dict]
) -> list[Finding]:
    findings: list[Finding] = []
    findings.extend(run_route_cases(surge, cases, "expect_surge", "Surge"))
    findings.extend(run_route_cases(loon, cases, "expect_loon", "Loon"))
    for case in cases:
        host = str(case["host"])
        left = route_host(surge, host)
        right = route_host(loon, host)
        if left.policy != right.policy:
            findings.append(
                Finding(
                    "warning",
                    "CLIENT_ROUTE_DIFF",
                    f"{host}：Surge={left.policy or '未匹配'}，Loon={right.policy or '未匹配'}",
                )
            )
    return sort_findings(findings)


def sort_findings(findings: Iterable[Finding]) -> list[Finding]:
    return sorted(
        findings,
        key=lambda item: (
            SEVERITY_ORDER.get(item.severity, 9),
            item.line if item.line is not None else 10**9,
            item.code,
        ),
    )


def counts(findings: Sequence[Finding]) -> dict[str, int]:
    return {
        severity: sum(item.severity == severity for item in findings)
        for severity in ("error", "warning", "info")
    }


def safe_model_name(model: ConfigModel) -> str:
    return model.path.name


def render_text(models: Sequence[ConfigModel], findings: Sequence[Finding]) -> str:
    summary = counts(findings)
    lines = [
        "Proxy Health Checker",
        "配置: " + ", ".join(f"{safe_model_name(m)} ({m.client})" for m in models),
        f"结果: {summary['error']} 错误, {summary['warning']} 警告, {summary['info']} 信息",
    ]
    for item in findings:
        location = f" line={item.line}" if item.line is not None else ""
        lines.append(f"[{item.severity.upper()}] {item.code}{location} - {item.message}")
    return "\n".join(lines) + "\n"


def render_markdown(models: Sequence[ConfigModel], findings: Sequence[Finding]) -> str:
    summary = counts(findings)
    lines = [
        "# Proxy Health Report",
        "",
        "- 配置：" + ", ".join(f"`{safe_model_name(m)}` ({m.client})" for m in models),
        f"- 结果：**{summary['error']}** 错误，**{summary['warning']}** 警告，**{summary['info']}** 信息",
        "",
        "| 级别 | 代码 | 行号 | 说明 |",
        "|---|---|---:|---|",
    ]
    for item in findings:
        line = str(item.line) if item.line is not None else "-"
        message = item.message.replace("|", "\\|")
        lines.append(f"| {item.severity} | `{item.code}` | {line} | {message} |")
    if not findings:
        lines.append("| info | `CLEAN` | - | 未发现问题 |")
    lines.extend(
        [
            "",
            "> 报告不会包含订阅 Token、节点密码、MITM 证书或其他匹配到的敏感原文。",
            "",
        ]
    )
    return "\n".join(lines)


def render_json(models: Sequence[ConfigModel], findings: Sequence[Finding]) -> str:
    payload = {
        "version": VERSION,
        "configs": [
            {"name": safe_model_name(model), "client": model.client}
            for model in models
        ],
        "summary": counts(findings),
        "findings": [asdict(item) for item in findings],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def emit_report(
    models: Sequence[ConfigModel],
    findings: Sequence[Finding],
    output_format: str,
    output: Path | None,
) -> None:
    if output_format == "markdown":
        rendered = render_markdown(models, findings)
    elif output_format == "json":
        rendered = render_json(models, findings)
    else:
        rendered = render_text(models, findings)
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)


def should_fail(findings: Sequence[Finding], fail_on: str) -> bool:
    if fail_on == "never":
        return False
    if fail_on == "warning":
        return any(item.severity in {"error", "warning"} for item in findings)
    return any(item.severity == "error" for item in findings)


def add_output_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--format", choices=("text", "markdown", "json"), default="text")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--fail-on", choices=("error", "warning", "never"), default="error")
    parser.add_argument(
        "--secret-level",
        choices=("error", "warning", "off"),
        default="warning",
        help="敏感信息发现的级别；公开发布前建议使用 error",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", action="version", version=VERSION)
    subparsers = parser.add_subparsers(dest="command", required=True)

    check = subparsers.add_parser("check", help="检查一个 Surge/Loon 配置")
    check.add_argument("config", type=Path)
    check.add_argument("--client", choices=("auto", "surge", "loon"), default="auto")
    add_output_options(check)

    test = subparsers.add_parser("test", help="执行域名路由回归测试")
    test.add_argument("config", type=Path)
    test.add_argument("cases", type=Path)
    test.add_argument("--client", choices=("auto", "surge", "loon"), default="auto")
    add_output_options(test)

    compare = subparsers.add_parser("compare", help="比较 Surge 与 Loon 的域名路由结果")
    compare.add_argument("surge", type=Path)
    compare.add_argument("loon", type=Path)
    compare.add_argument("cases", type=Path)
    add_output_options(compare)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "check":
            model = parse_config(args.config, args.client)
            models = [model]
            findings = run_checks(model, args.secret_level)
        elif args.command == "test":
            model = parse_config(args.config, args.client)
            models = [model]
            findings = sort_findings(
                run_checks(model, args.secret_level)
                + run_route_cases(model, load_route_cases(args.cases))
            )
        else:
            surge = parse_config(args.surge, "surge")
            loon = parse_config(args.loon, "loon")
            models = [surge, loon]
            cases = load_route_cases(args.cases)
            findings = sort_findings(
                run_checks(surge, args.secret_level)
                + run_checks(loon, args.secret_level)
                + compare_routes(surge, loon, cases)
            )
        emit_report(models, findings, args.format, args.output)
        return 1 if should_fail(findings, args.fail_on) else 0
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as exc:
        print(f"proxy-health: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

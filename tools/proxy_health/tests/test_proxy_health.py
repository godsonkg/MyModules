import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "proxy_health.py"
SPEC = importlib.util.spec_from_file_location("proxy_health", SCRIPT)
assert SPEC and SPEC.loader
proxy_health = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = proxy_health
SPEC.loader.exec_module(proxy_health)


class ProxyHealthTests(unittest.TestCase):
    def write_config(self, content: str) -> Path:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "profile.conf"
        path.write_text(content, encoding="utf-8")
        return path

    def codes(self, findings):
        return [finding.code for finding in findings]

    def test_valid_config_and_route(self):
        path = self.write_config(
            """
[Proxy]
HK = ss, example.invalid, 443, password=REDACTED
[Proxy Group]
AI = select, HK, DIRECT
[Rule]
DOMAIN-SUFFIX,qidian.com,DIRECT
DOMAIN-SUFFIX,openai.com,AI
FINAL,AI
""".strip()
        )
        model = proxy_health.parse_config(path, "loon")
        findings = proxy_health.run_checks(model)
        self.assertNotIn("POLICY_MISSING", self.codes(findings))
        route = proxy_health.route_host(model, "api.openai.com")
        self.assertEqual(route.policy, "AI")
        self.assertEqual(route.matched_by, "DOMAIN-SUFFIX")

    def test_duplicate_conflict_and_rule_after_final(self):
        path = self.write_config(
            """
[Proxy Group]
Main = select, DIRECT
[Rule]
DOMAIN,example.com,DIRECT
DOMAIN,example.com,Main
FINAL,Main
DOMAIN,late.example,DIRECT
""".strip()
        )
        findings = proxy_health.run_checks(proxy_health.parse_config(path))
        codes = self.codes(findings)
        self.assertIn("RULE_CONFLICT", codes)
        self.assertIn("RULE_AFTER_FINAL", codes)

    def test_shadowed_specific_rule(self):
        path = self.write_config(
            """
[Proxy Group]
Main = select, DIRECT
[Rule]
DOMAIN-SUFFIX,example.com,Main
DOMAIN,api.example.com,DIRECT
FINAL,Main
""".strip()
        )
        findings = proxy_health.run_checks(proxy_health.parse_config(path))
        self.assertIn("RULE_SHADOWED", self.codes(findings))

    def test_missing_policy(self):
        path = self.write_config(
            """
[Rule]
DOMAIN,example.com,DoesNotExist
FINAL,DIRECT
""".strip()
        )
        findings = proxy_health.run_checks(proxy_health.parse_config(path))
        self.assertIn("POLICY_MISSING", self.codes(findings))

    def test_secret_value_is_never_reported(self):
        secret = "do-not-leak-this-value"
        path = self.write_config(
            f"""
[Remote Proxy]
Private = https://example.invalid/sub?token={secret}
[MITM]
ca-passphrase = {secret}
[Rule]
FINAL,DIRECT
""".strip()
        )
        model = proxy_health.parse_config(path, "loon")
        findings = proxy_health.run_checks(model)
        rendered = proxy_health.render_json([model], findings)
        self.assertIn("SECRET_URL_PARAMETER", rendered)
        self.assertIn("SECRET_CA_PASSWORD", rendered)
        self.assertNotIn(secret, rendered)

    def test_secret_findings_are_aggregated_and_configurable(self):
        path = self.write_config(
            """
[Remote Proxy]
One = https://example.invalid/sub?token=first-private-value
Two = https://example.invalid/sub?token=second-private-value
[Rule]
FINAL,DIRECT
""".strip()
        )
        model = proxy_health.parse_config(path, "loon")
        warnings = proxy_health.secret_findings(model)
        self.assertEqual(len(warnings), 1)
        self.assertEqual(warnings[0].severity, "warning")
        self.assertIn("2", warnings[0].message)
        errors = proxy_health.secret_findings(model, "error")
        self.assertEqual(errors[0].severity, "error")
        self.assertEqual(proxy_health.secret_findings(model, "off"), [])

    def test_remote_rule_makes_route_uncertain(self):
        path = self.write_config(
            """
[Proxy Group]
Main = select, DIRECT
[Rule]
RULE-SET,https://example.invalid/rules.list,Main
FINAL,DIRECT
""".strip()
        )
        model = proxy_health.parse_config(path)
        route = proxy_health.route_host(model, "example.com")
        self.assertEqual(route.policy, "DIRECT")
        self.assertTrue(route.unresolved_remote_lines)

    def test_route_case_mismatch(self):
        path = self.write_config(
            """
[Rule]
DOMAIN-SUFFIX,example.com,DIRECT
FINAL,REJECT
""".strip()
        )
        model = proxy_health.parse_config(path)
        findings = proxy_health.run_route_cases(
            model, [{"host": "example.com", "expect": "REJECT"}]
        )
        self.assertIn("ROUTE_MISMATCH", self.codes(findings))

    def test_markdown_uses_filename_not_absolute_path(self):
        path = self.write_config("[Rule]\nFINAL,DIRECT\n")
        model = proxy_health.parse_config(path)
        report = proxy_health.render_markdown([model], [])
        self.assertIn("profile.conf", report)
        self.assertNotIn(str(path.parent), report)


if __name__ == "__main__":
    unittest.main()

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from test_proxy_health import proxy_health as ph


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.url = 'https://example.invalid/rules.list'

    def mapped(self, content, kind='RULE-SET', **overrides):
        (self.base / 'rules.list').write_text(content)
        entry = dict(type=kind, source=self.url, file='rules.list',
                     sha256=hashlib.sha256(content.encode()).hexdigest())
        entry.update(overrides)
        path = self.base / 'map.json'
        path.write_text(json.dumps(dict(version=1, sets=[entry])))
        return path

    def model(self, mapping, kind='RULE-SET', before='', after='FINAL,REJECT'):
        config = self.base / 'config.conf'
        config.write_text(f'[Rule]\n{before}{kind},{self.url},DIRECT\n{after}\n')
        model = ph.parse_config(config, 'surge')
        model.remote_rules = ph.load_rule_snapshots(mapping)
        return model

    def test_exact_suffix_keyword_and_no_match(self):
        model = self.model(self.mapped('DOMAIN,one.test\nDOMAIN-SUFFIX,two.test\nDOMAIN-KEYWORD,three\n'))
        for host in ['one.test', 'sub.two.test', 'three.test']:
            route = ph.route_host(model, host)
            self.assertEqual(route.policy, 'DIRECT')
            self.assertFalse(route.unresolved_remote_lines)
        self.assertEqual(ph.route_host(model, 'sub.one.test').policy, 'REJECT')
        self.assertEqual(ph.route_host(model, 'nottwo.test').policy, 'REJECT')

    def test_domain_set_and_case(self):
        model = self.model(self.mapped('exact.test\n.suffix.test\n', 'DOMAIN-SET'), 'DOMAIN-SET')
        self.assertEqual(ph.route_host(model, 'SUB.SUFFIX.TEST.').policy, 'DIRECT')
        self.assertEqual(ph.route_host(model, 'sub.exact.test').policy, 'REJECT')

    def test_order_parent_policy_and_repeated_checks(self):
        model = self.model(self.mapped('DOMAIN-SUFFIX,test\n'), before='DOMAIN,one.test,REJECT\n')
        for _ in range(2):
            self.assertEqual(ph.route_host(model, 'one.test').policy, 'REJECT')
            self.assertEqual(ph.route_host(model, 'two.test').policy, 'DIRECT')

    def test_unsupported_preserves_position_and_no_false_ok(self):
        model = self.model(self.mapped('DOMAIN,known.test\nIP-CIDR,1.2.3.0/24\nDOMAIN,later.test\n'))
        self.assertFalse(ph.route_host(model, 'known.test').unresolved_remote_lines)
        result = ph.run_route_cases(model, [{'host': 'later.test', 'expect': 'DIRECT'}])
        self.assertIn('ROUTE_UNCERTAIN', [f.code for f in result])
        self.assertNotIn('ROUTE_OK', [f.code for f in result])

    def test_missing_mapping_preserves_uncertainty(self):
        model = self.model(self.mapped('DOMAIN,test\n', source='https://other.invalid/rules'))
        self.assertTrue(ph.route_host(model, 'test').unresolved_remote_lines)

    def test_hash_mismatch_missing_file_and_path_escape_rejected(self):
        for override in [dict(sha256='0'*64), dict(file='missing'), dict(file='../escape'), dict(file='/etc/passwd')]:
            with self.subTest(override=override), self.assertRaises(ValueError):
                ph.load_rule_snapshots(self.mapped('DOMAIN,test\n', **override))

    def test_malformed_mapping_and_secrets_not_echoed(self):
        for value in [None, [], {'version': 1, 'sets': [None]}, {'version': 1, 'sets': [{}]}]:
            path = self.base / 'invalid.json';path.write_text(json.dumps(value))
            with self.assertRaises(ValueError):ph.load_rule_snapshots(path)
        for source in ['https://user:SECRET@example.invalid/rules', 'https://example.invalid/rules?token=SECRET', 'file:///SECRET']:
            with self.assertRaises(ValueError) as error:
                ph.load_rule_snapshots(self.mapped('DOMAIN,test\n', source=source))
            self.assertNotIn('SECRET', str(error.exception))

    def test_duplicate_mapping_rejected(self):
        path=self.mapped('DOMAIN,test\n');data=json.loads(path.read_text());data['sets']*=2;path.write_text(json.dumps(data))
        with self.assertRaises(ValueError):ph.load_rule_snapshots(path)

    def test_empty_snapshot_is_known_empty(self):
        model = self.model(self.mapped('# empty\n'))
        self.assertFalse(ph.route_host(model, 'test').unresolved_remote_lines)

    def test_packaged_pikpak_emby_cases(self):
        base=Path(__file__).parents[1]/'examples'
        model=ph.parse_config(base/'external-rules.conf', 'surge')
        model.remote_rules=ph.load_rule_snapshots(base/'rule-map.json')
        result=ph.run_route_cases(model, ph.load_route_cases(base/'external-route-tests.json'))
        self.assertTrue(result)
        self.assertTrue(all(f.code=='ROUTE_OK' for f in result))
        self.assertTrue(ph.route_host(model, 'cf.yunti.online').unresolved_remote_lines)

    def test_compare_uses_each_parent_policy(self):
        mapping=self.mapped('DOMAIN,test\n');left=self.model(mapping)
        right=self.model(mapping);right.rules=[ph.Rule(r.line,r.kind,r.value,'REJECT',r.raw_parts) for r in right.rules]
        findings=ph.compare_routes(left,right,[{'host':'test','expect_surge':'DIRECT','expect_loon':'REJECT'}])
        self.assertIn('CLIENT_ROUTE_DIFF',[f.code for f in findings])

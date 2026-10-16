import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import update_fuel


OFFICIAL_INDEX = "<index>"
OFFICIAL_ARTICLE = "<article>"
REFERENCE_PAGE = "<reference>"


def existing_data() -> dict:
    return {
        "province": "广东",
        "city": "广州",
        "updated_at": "2026-09-01",
        "unit": "元/升",
        "price_type": "old",
        "items": [
            {"name": "92#", "price": 7.1},
            {"name": "95#", "price": 7.7},
            {"name": "98#", "price": 9.9},
            {"name": "0# 柴油", "price": 6.8},
        ],
        "reference_updated_at": "2026-09-01",
    }


class UpdateFuelTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.output = Path(self.temp_dir.name) / "fuel.json"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def write_existing(self) -> None:
        self.output.write_text(
            json.dumps(existing_data(), ensure_ascii=False), encoding="utf-8"
        )

    def run_update(self, reference_result):
        with (
            patch.object(
                update_fuel,
                "fetch_page",
                side_effect=[OFFICIAL_INDEX, OFFICIAL_ARTICLE],
            ),
            patch.object(
                update_fuel,
                "find_latest_official_article",
                return_value=("https://official.example/article", "2026-09-15"),
            ),
            patch.object(
                update_fuel,
                "parse_official_prices",
                return_value=[7.2, 7.8, 6.9],
            ),
            patch.object(
                update_fuel, "fetch_reference_prices", return_value=reference_result
            ),
        ):
            return update_fuel.update_file(
                self.output,
                "https://official.example/index",
                "https://reference.example/price",
            )

    def test_optional_reference_failure_keeps_98_and_updates_official_prices(self):
        self.write_existing()

        changed = self.run_update(None)

        self.assertTrue(changed)
        data = json.loads(self.output.read_text(encoding="utf-8"))
        self.assertEqual([7.2, 7.8, 9.9, 6.9], update_fuel.current_prices(data))
        self.assertEqual("2026-09-15", data["updated_at"])
        self.assertEqual("2026-09-01", data["reference_updated_at"])
        self.assertIn("本次不可用", data["reference_status"])

    def test_optional_reference_failure_requires_a_historical_98_price(self):
        with self.assertRaisesRegex(ValueError, "没有可沿用的历史 98#"):
            self.run_update(None)

    def test_repeated_reference_failure_does_not_rewrite_unchanged_fallback(self):
        self.write_existing()
        self.assertTrue(self.run_update(None))

        self.assertFalse(self.run_update(None))

    def test_reference_recovery_refreshes_98_price(self):
        self.write_existing()

        changed = self.run_update(("2026-09-19", [7.2, 7.8, 10.1, 6.9]))

        self.assertTrue(changed)
        data = json.loads(self.output.read_text(encoding="utf-8"))
        self.assertEqual([7.2, 7.8, 10.1, 6.9], update_fuel.current_prices(data))
        self.assertEqual("2026-09-19", data["reference_updated_at"])
        self.assertIn("已与本轮官方调价同步", data["reference_status"])

    def test_reference_parser_error_is_soft_failure(self):
        with (
            patch.object(update_fuel, "fetch_page", return_value=REFERENCE_PAGE),
            patch.object(
                update_fuel,
                "parse_reference_prices",
                side_effect=ValueError("layout changed"),
            ),
        ):
            self.assertIsNone(
                update_fuel.fetch_reference_prices("https://reference.example/price")
            )


# 2026-10-16 实际列表页结构：最新一条是“不作调整”公告，它没有价格表。
REAL_INDEX = """
<ul>
<li><a href="https://drc.gd.gov.cn/spjg/content/post_4967005.html" target="_blank">2026年10月15日成品油价格不作调整</a></li>
<li><a href="https://drc.gd.gov.cn/spjg/content/post_4960319.html" target="_blank">2026年9月24日24时起成品油价格调整</a></li>
<li><a href="https://drc.gd.gov.cn/spjg/content/post_4954696.html" target="_blank">2026年9月11日24时起成品油价格调整</a></li>
<li><a href="https://drc.gd.gov.cn/spjg/content/post_4864791.html" target="_blank">2026年3月9日24时起成品油价格按机制调整</a></li>
</ul>
"""

ADJUSTMENT_ARTICLE = """
<html><head><script>var junk = "92号汽油 99999 99999 19.99";</script>
<style>.x{content:"0号柴油"}</style></head><body>
<table>
<tr><td>品种</td><td>批发价（元/吨）</td><td>零售价（元/吨）</td><td>零售价（元/升）</td></tr>
<tr><td>92号汽油</td><td>10910</td><td>11650</td><td>8.63</td></tr>
<tr><td>95号汽油</td><td>11780</td><td>12520</td><td>9.35</td></tr>
<tr><td>0号柴油</td><td>9870</td><td>10630</td><td>8.31</td></tr>
</table></body></html>
"""


def data_matching_0924() -> dict:
    return {
        "province": "广东",
        "city": "广州",
        "updated_at": "2026-09-24",
        "unit": "元/升",
        "price_type": "92#/95#/柴油为广东省最高零售价；98#暂沿用最近一次广州参考价",
        "items": [
            {"name": "92#", "price": 8.63},
            {"name": "95#", "price": 9.35},
            {"name": "98#", "price": 11.0},
            {"name": "0# 柴油", "price": 8.31},
        ],
        "source_url": "https://drc.gd.gov.cn/spjg/content/post_4960319.html",
        "reference_updated_at": "2026-09-13",
    }


class OfficialNoticeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.output = Path(self.temp_dir.name) / "fuel.json"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_latest_article_skips_no_adjustment_notice(self):
        url, date = update_fuel.find_latest_official_article(REAL_INDEX)
        self.assertEqual("https://drc.gd.gov.cn/spjg/content/post_4960319.html", url)
        self.assertEqual("2026-09-24", date)

    def test_latest_notice_reports_no_adjustment(self):
        notice = update_fuel.find_latest_notice(REAL_INDEX)
        self.assertEqual("2026-10-15", notice.date)
        self.assertFalse(notice.adjusted)
        self.assertEqual("2026年10月15日成品油价格不作调整", notice.title)

    def test_mechanism_adjustment_counts_as_adjustment(self):
        notices = update_fuel.find_official_notices(REAL_INDEX)
        self.assertEqual([False, True, True, True], [n.adjusted for n in notices])

    def test_index_with_only_no_adjustment_notices_is_an_error(self):
        index = REAL_INDEX.split("<li>")[0] + "<li>" + REAL_INDEX.split("<li>")[1]
        with self.assertRaisesRegex(ValueError, "未在广东省发改委列表找到"):
            update_fuel.find_latest_official_article(index)

    def test_parse_standard_price_table_ignores_scripts(self):
        self.assertEqual(
            [8.63, 9.35, 8.31],
            update_fuel.parse_official_prices(ADJUSTMENT_ARTICLE),
        )

    def test_parse_tolerates_alternative_layout(self):
        page = "<p>92#汽油（元/升）：8.63；95#汽油（元/升）：9.35；0#柴油（元/升）：8.31。</p>"
        self.assertEqual([8.63, 9.35, 8.31], update_fuel.parse_official_prices(page))

    def test_no_adjustment_round_keeps_prices_and_records_notice(self):
        self.output.write_text(
            json.dumps(data_matching_0924(), ensure_ascii=False), encoding="utf-8"
        )

        def run():
            with (
                patch.object(
                    update_fuel,
                    "fetch_page",
                    side_effect=[REAL_INDEX, ADJUSTMENT_ARTICLE],
                ),
                patch.object(update_fuel, "fetch_reference_prices", return_value=None),
            ):
                return update_fuel.update_file(
                    self.output,
                    "https://drc.gd.gov.cn/spjg/index.html",
                    "https://reference.example/price",
                )

        self.assertTrue(run())
        data = json.loads(self.output.read_text(encoding="utf-8"))
        self.assertEqual([8.63, 9.35, 11.0, 8.31], update_fuel.current_prices(data))
        self.assertEqual("2026-09-24", data["updated_at"])
        self.assertEqual("2026-10-15", data["latest_notice"]["date"])
        self.assertFalse(data["latest_notice"]["adjusted"])
        # 同一轮再次运行不应产生新提交
        self.assertFalse(run())

    def test_staleness_uses_latest_notice_date(self):
        data = data_matching_0924()
        data["updated_at"] = "2020-01-01"
        data["latest_notice"] = {"date": "2099-01-01"}
        self.output.write_text(json.dumps(data), encoding="utf-8")
        self.assertLessEqual(update_fuel.days_since_update(self.output), 0)


# 第三方参考页 2026-10-16 实际正文（日期后多了“起执行（展示日…）”）
REFERENCE_NEW = """
<p>2026年10月15日起执行（展示日 2026年10月16日），广州最新油价如下：
92号汽油为8.63元， 95号汽油为9.35元， 98号汽油为11.35元， 0号柴油为8.31元。</p>
<table><tr><td>油品类型</td><td>价格（元/升）</td></tr>
<tr><td>广州92#汽油</td><td>8.63</td></tr><tr><td>广州95#汽油</td><td>9.35</td></tr>
<tr><td>广州98#汽油</td><td>11.35</td></tr><tr><td>广州0#柴油</td><td>8.31</td></tr></table>
"""

REFERENCE_OLD = (
    "<p>2026年9月13日，广州最新油价如下：92号汽油为8.40元， 95号汽油为9.10元，"
    " 98号汽油为11.00元， 0号柴油为8.10元。</p>"
)


class ReferencePageTests(unittest.TestCase):
    def test_parses_current_layout(self):
        self.assertEqual(
            ("2026-10-15", [8.63, 9.35, 11.35, 8.31]),
            update_fuel.parse_reference_prices(REFERENCE_NEW),
        )

    def test_still_parses_previous_layout(self):
        self.assertEqual(
            ("2026-09-13", [8.4, 9.1, 11.0, 8.1]),
            update_fuel.parse_reference_prices(REFERENCE_OLD),
        )

    def test_falls_back_to_price_table_when_sentence_missing(self):
        page = REFERENCE_NEW.replace("98号汽油为11.35元，", "")
        self.assertEqual(
            [8.63, 9.35, 11.35, 8.31], update_fuel.parse_reference_prices(page)[1]
        )

    def test_missing_grade_is_an_error(self):
        page = REFERENCE_OLD.replace(" 98号汽油为11.00元，", "")
        with self.assertRaisesRegex(ValueError, "完整的广州油价字段"):
            update_fuel.parse_reference_prices(page)


if __name__ == "__main__":
    unittest.main()

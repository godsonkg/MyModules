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


if __name__ == "__main__":
    unittest.main()

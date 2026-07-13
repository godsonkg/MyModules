#!/usr/bin/env python3
"""Fetch Guangzhou reference fuel prices and update the repository JSON safely."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen


SOURCE_URL = "https://oil.qqday.com/city/440100.htm"
DEFAULT_OUTPUT = Path("data/guangdong_fuel.json")
PRICE_NAMES = ("92#", "95#", "98#", "0# 柴油")


def fetch_page(url: str) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; MyModules-FuelUpdater/1.0)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urlopen(request, timeout=30) as response:
        raw = response.read()
        charset = response.headers.get_content_charset() or "utf-8"
    return raw.decode(charset, errors="replace")


def parse_prices(page: str) -> tuple[str, list[float]]:
    text = re.sub(r"<[^>]+>", " ", page)
    text = html.unescape(re.sub(r"\s+", " ", text))
    pattern = re.compile(
        r"(\d{4})年(\d{1,2})月(\d{1,2})日，广州最新油价如下：\s*"
        r"92号汽油为([0-9]+(?:\.[0-9]+)?)元，\s*"
        r"95号汽油为([0-9]+(?:\.[0-9]+)?)元，\s*"
        r"98号汽油为([0-9]+(?:\.[0-9]+)?)元，\s*"
        r"0号柴油为([0-9]+(?:\.[0-9]+)?)元"
    )
    match = pattern.search(text)
    if not match:
        raise ValueError("未在数据源页面找到完整的广州油价字段")

    year, month, day = map(int, match.group(1, 2, 3))
    source_date = datetime(year, month, day).strftime("%Y-%m-%d")
    prices = [round(float(value), 2) for value in match.group(4, 5, 6, 7)]
    validate_prices(prices)
    return source_date, prices


def validate_prices(prices: list[float]) -> None:
    p92, p95, p98, diesel = prices
    if not all(4.0 <= value <= 20.0 for value in prices):
        raise ValueError(f"抓取价格超出合理范围: {prices}")
    if not (p92 < p95 < p98 and diesel < p92):
        raise ValueError(f"抓取价格的牌号顺序异常: {prices}")


def load_current(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def current_prices(data: dict) -> list[float] | None:
    by_name = {item.get("name"): item.get("price") for item in data.get("items", [])}
    if not all(name in by_name for name in PRICE_NAMES):
        return None
    return [round(float(by_name[name]), 2) for name in PRICE_NAMES]


def update_file(output: Path, source_url: str) -> bool:
    source_date, prices = parse_prices(fetch_page(source_url))
    current = load_current(output)
    if current_prices(current) == prices and current.get("price_type") == "参考指导价":
        print(f"价格未变化，保留现有文件: {prices}")
        return False

    data = {
        "province": "广东",
        "city": "广州",
        "updated_at": source_date,
        "unit": "元/升",
        "price_type": "参考指导价",
        "items": [
            {"name": name, "price": price}
            for name, price in zip(PRICE_NAMES, prices)
        ],
        "source": "广州油价页（参考指导价；加油站实际价可能不同）",
        "source_url": source_url,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"已更新 {output}: {prices}（来源日期 {source_date}）")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=SOURCE_URL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        update_file(args.output, args.source)
    except Exception as exc:
        print(f"油价更新失败，保留原数据: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

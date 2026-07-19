#!/usr/bin/env python3
"""Fetch Guangdong fuel prices and update the repository JSON safely."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen


OFFICIAL_INDEX_URL = "https://drc.gd.gov.cn/spjg/index.html"
REFERENCE_URL = "https://oil.qqday.com/city/440100.htm"
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


def page_text(page: str) -> str:
    text = re.sub(r"<[^>]+>", " ", page)
    return html.unescape(re.sub(r"\s+", " ", text))


def find_latest_official_article(index_page: str) -> tuple[str, str]:
    pattern = re.compile(
        r'href=["\']([^"\']+)["\'][^>]*>\s*'
        r'(\d{4})年(\d{1,2})月(\d{1,2})日[^<]*成品油价格[^<]*调整'
    )
    match = pattern.search(index_page)
    if not match:
        raise ValueError("未在广东省发改委列表找到最新成品油调价公告")
    effective_date = datetime(
        int(match.group(2)), int(match.group(3)), int(match.group(4))
    ).strftime("%Y-%m-%d")
    return urljoin(OFFICIAL_INDEX_URL, match.group(1)), effective_date


def parse_official_prices(page: str) -> list[float]:
    text = page_text(page)
    patterns = (
        r"92号汽油[^0-9]{0,40}\d{4,5}\s+\d{4,5}\s+([0-9]+(?:\.[0-9]+)?)",
        r"95号汽油[^0-9]{0,40}\d{4,5}\s+\d{4,5}\s+([0-9]+(?:\.[0-9]+)?)",
        r"0号柴油[^0-9]{0,40}\d{4,5}\s+\d{4,5}\s+([0-9]+(?:\.[0-9]+)?)",
    )
    prices = []
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            raise ValueError("广东省发改委公告的价格表解析不完整")
        prices.append(round(float(match.group(1)), 2))
    return prices


def parse_reference_prices(page: str) -> tuple[str, list[float]]:
    text = page_text(page)
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


def update_file(output: Path, official_index_url: str, reference_url: str) -> bool:
    index_page = fetch_page(official_index_url)
    official_url, effective_date = find_latest_official_article(index_page)
    official_92, official_95, official_diesel = parse_official_prices(
        fetch_page(official_url)
    )
    reference_date, reference_prices = parse_reference_prices(fetch_page(reference_url))
    reference_92, reference_95, reference_98, reference_diesel = reference_prices
    official = [official_92, official_95, official_diesel]
    reference_comparable = [reference_92, reference_95, reference_diesel]
    current = load_current(output)
    existing_prices = current_prices(current)
    reference_matches = all(
        abs(a - b) <= 0.01 for a, b in zip(official, reference_comparable)
    )

    if reference_matches:
        price_98 = reference_98
        price_type = "92#/95#/柴油为广东省最高零售价；98#为广州参考价"
        reference_status = "第三方参考价已与本轮官方调价同步"
    else:
        if existing_prices is None:
            raise ValueError(
                "第三方页面尚未同步本轮调价，且没有可保留的历史 98# 参考价"
            )
        price_98 = existing_prices[2]
        price_type = "92#/95#/柴油为广东省最高零售价；98#暂沿用最近一次广州参考价"
        reference_status = "第三方来源尚未同步本轮调价，98#暂沿用最近一次参考价"
        print(
            f"警告: 官方价格已更新为 {official}，第三方仍为 "
            f"{reference_comparable}；98# 暂保留 {price_98}",
            file=sys.stderr,
        )

    prices = [official_92, official_95, price_98, official_diesel]
    validate_prices(prices)
    if (
        existing_prices == prices
        and current.get("price_type") == price_type
        and current.get("source_url") == official_url
        and current.get("reference_updated_at") == reference_date
    ):
        print(f"价格未变化，保留现有文件: {prices}")
        return False

    data = {
        "province": "广东",
        "city": "广州",
        "updated_at": effective_date,
        "unit": "元/升",
        "price_type": price_type,
        "items": [
            {"name": name, "price": price}
            for name, price in zip(PRICE_NAMES, prices)
        ],
        "source": "广东省发改委最高零售价；98#为广州参考价",
        "source_url": official_url,
        "reference_source_url": reference_url,
        "reference_updated_at": reference_date,
        "reference_status": reference_status,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"已更新 {output}: {prices}（官方执行日期 {effective_date}）")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--official-index", default=OFFICIAL_INDEX_URL)
    parser.add_argument("--reference", default=REFERENCE_URL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        update_file(args.output, args.official_index, args.reference)
    except Exception as exc:
        print(f"油价更新失败，保留原数据: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Publish validated official prices; the optional 98# source never blocks them."""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import tempfile
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

OFFICIAL_INDEX_URL = "https://drc.gd.gov.cn/spjg/index.html"
REFERENCE_URL = "https://oil.qqday.com/city/440100.htm"
DEFAULT_OUTPUT = Path("data/guangdong_fuel.json")
PRICE_NAMES = ("92#", "95#", "98#", "0# 柴油")
CHINA_TIME = timezone(timedelta(hours=8))
STALE_ALERT_DAYS = 3
TRANSIENT_HTTP_STATUSES = {408, 429} | set(range(500, 600))
NO_ADJUSTMENT_RE = re.compile(r"(?:不作|不予|暂不|暂停|不)\s*调整")
DATE_RE = re.compile(r"(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日")
OFFICIAL_LABELS = (r"(?<!\d)92\s*[号#]\s*汽油", r"(?<!\d)95\s*[号#]\s*汽油", r"(?<!\d)0\s*[号#]\s*柴油")
REFERENCE_GRADES = (("92", "汽油"), ("95", "汽油"), ("98", "汽油"), ("0", "柴油"))


def china_today() -> str:
    return datetime.now(CHINA_TIME).strftime("%Y-%m-%d")


class NetworkError(Exception):
    """Bounded retries exhausted; a last-good snapshot may be retained."""


class Page(HTMLParser):
    """Extract anchors and table cells independently of nested presentation tags."""
    def __init__(self, source: str):
        super().__init__(convert_charrefs=True)
        self.links, self.rows, self.parts = [], [], []
        self.link = self.row = self.cell = None
        self.hidden = 0
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1
        if self.hidden:
            return
        if tag == "a":
            self.link = [dict(attrs).get("href", ""), []]
        elif tag == "tr":
            self.row = []
        elif tag in ("td", "th"):
            self.cell = []
        if tag in ("br", "p", "div", "tr", "td", "th", "li"):
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.hidden = max(0, self.hidden - 1)
            return
        if self.hidden:
            return
        if tag == "a" and self.link is not None:
            self.links.append((self.link[0], "".join(self.link[1])))
            self.link = None
        elif tag in ("td", "th") and self.cell is not None:
            if self.row is not None:
                self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None
        if tag in ("p", "div", "tr", "td", "th", "li"):
            self.parts.append(" ")

    def handle_data(self, data):
        if self.hidden:
            return
        self.parts.append(data)
        if self.link is not None:
            self.link[1].append(data)
        if self.cell is not None:
            self.cell.append(data)

    @property
    def text(self):
        return " ".join("".join(self.parts).split())


def page_text(page: str) -> str:
    return Page(page).text


def fetch_page(url: str, *, retries: int = 3, backoff: float = 1.0) -> str:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0 MyModules-Fuel/2.0", "Cache-Control": "no-cache"})
    last_error = None
    for attempt in range(retries):
        try:
            with urlopen(request, timeout=15) as response:
                raw = response.read(2_000_001)
                if len(raw) > 2_000_000:
                    raise ValueError("源站页面超过大小上限")
                charset = response.headers.get_content_charset() or "utf-8"
            return raw.decode(charset)
        except HTTPError as exc:
            if exc.code not in TRANSIENT_HTTP_STATUSES:
                raise
            last_error = exc
        except (URLError, TimeoutError, OSError) as exc:
            last_error = exc
        if attempt + 1 < retries:
            time.sleep(backoff * (2 ** attempt))
    raise NetworkError(f"已尝试 {retries} 次：{url} -> {last_error}")


@dataclass(frozen=True)
class OfficialNotice:
    url: str
    date: str
    title: str
    adjusted: bool


def find_official_notices(index_page: str) -> list[OfficialNotice]:
    notices = {}
    for href, title in Page(index_page).links:
        title = " ".join(title.split())
        match = DATE_RE.search(title)
        url = urljoin(OFFICIAL_INDEX_URL, href)
        if not match or "成品油价格" not in title or "调整" not in title:
            continue
        if urlparse(url).hostname != "drc.gd.gov.cn":
            continue
        date = datetime(*map(int, match.groups())).strftime("%Y-%m-%d")
        notices[url] = OfficialNotice(url, date, title, not bool(NO_ADJUSTMENT_RE.search(title)))
    return sorted(notices.values(), key=lambda n: n.date, reverse=True)


def find_latest_notice(index_page: str) -> OfficialNotice | None:
    notices = find_official_notices(index_page)
    return notices[0] if notices else None


def find_latest_official_article(index_page: str) -> tuple[str, str]:
    for notice in find_official_notices(index_page):
        if notice.date > china_today():
            continue
        if re.search(r"24\s*时", notice.title) and notice.date == china_today():
            continue
        if notice.adjusted:
            return notice.url, notice.date
    raise ValueError("未在广东省发改委列表找到最新成品油调价公告")


def valid_price(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 4 <= value <= 20


def validate_official(prices) -> None:
    if len(prices) != 3 or not all(valid_price(p) for p in prices):
        raise ValueError(f"官方价格范围异常: {prices}")
    if not prices[2] < prices[0] < prices[1]:
        raise ValueError(f"官方价格牌号顺序异常: {prices}")


def validate_prices(prices) -> None:
    if len(prices) != 4:
        raise ValueError("价格牌号不完整")
    p92, p95, p98, diesel = prices
    validate_official([p92, p95, diesel])
    if not valid_price(p98) or p98 <= p95:
        raise ValueError(f"98#参考价异常: {p98}")


def parse_official_prices(page: str) -> list[float]:
    parsed = Page(page)
    prices = []
    for label in OFFICIAL_LABELS:
        candidates = set()
        for row in parsed.rows:
            if not row or not re.search(label, row[0]):
                continue
            # Never search a free-form window that could take the next grade.
            value = row[-1].replace("元/升", "").strip()
            if re.fullmatch(r"\d{1,2}(?:\.\d{1,2})?", value):
                candidates.add(float(value))
        if not candidates:
            pattern = label + r"\s*[（(]?元/升[）)]?\s*[:：]?\s*(\d{1,2}(?:\.\d{1,2})?)"
            candidates.update(float(m) for m in re.findall(pattern, parsed.text))
        if len(candidates) != 1:
            raise ValueError("广东省发改委公告的价格表解析不完整或存在冲突")
        prices.append(candidates.pop())
    validate_official(prices)
    return prices


def parse_reference_prices(page: str) -> tuple[str, list[float]]:
    parsed = Page(page)
    # A display date is not a price effective date.
    text = re.sub(r"展示日\s*\d{4}年\d{1,2}月\d{1,2}日", "", parsed.text)
    match = DATE_RE.search(text)
    if "广州" not in text or match is None:
        raise ValueError("未在数据源页面找到完整的广州油价字段")
    date = datetime(*map(int, match.groups())).strftime("%Y-%m-%d")
    prices = []
    for number, kind in REFERENCE_GRADES:
        label = rf"(?<!\d){number}\s*[号#]\s*{kind}"
        values = {float(v) for v in re.findall(label + r"\s*为\s*(\d+(?:\.\d+)?)\s*元", text)}
        for row in parsed.rows:
            if len(row) >= 2 and re.search(label, row[0]):
                if re.fullmatch(r"\d+(?:\.\d+)?", row[1]):
                    values.add(float(row[1]))
        if len(values) != 1:
            raise ValueError("未在数据源页面找到完整的广州油价字段，或表格与正文冲突")
        prices.append(values.pop())
    validate_prices(prices)
    return date, prices


def fetch_reference_prices(reference_url: str):
    try:
        return parse_reference_prices(fetch_page(reference_url, retries=2))
    except (NetworkError, HTTPError, URLError, OSError, ValueError, UnicodeError) as exc:
        print(f"::warning::98#参考源不可用: {exc}", file=sys.stderr)
        return None


def load_current(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def current_prices(data: dict):
    by_name = {item.get("name"): item.get("price") for item in data.get("items", [])}
    if not all(name in by_name for name in PRICE_NAMES):
        return None
    return [by_name[name] for name in PRICE_NAMES]


def save_snapshot(output: Path, data: dict) -> bool:
    if load_current(output) == data:
        return False
    output.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent, delete=False) as temp:
            name = temp.name
            temp.write(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
        os.replace(name, output)
    finally:
        if name and os.path.exists(name):
            os.unlink(name)
    return True


def days_since_update(path: Path) -> int | None:
    data = load_current(path)
    checked = data.get("checked_at") or (data.get("latest_notice") or {}).get("date") or data.get("updated_at")
    try:
        return (datetime.strptime(china_today(), "%Y-%m-%d") - datetime.strptime(checked, "%Y-%m-%d")).days
    except (ValueError, TypeError):
        return None


def update_file(output: Path, official_index_url: str, reference_url: str) -> bool:
    current = load_current(output)
    index_page = fetch_page(official_index_url)
    latest_notice = find_latest_notice(index_page)
    try:
        official_url, effective_date = find_latest_official_article(index_page)
    except ValueError:
        # The previous adjustment may have left page one after several unchanged
        # rounds. Re-read its official price table; never infer prices from a
        # no-adjustment notice alone or skip a newer adjustment.
        if (latest_notice is None or latest_notice.adjusted
                or latest_notice.date < current.get("updated_at", "9999")
                or urlparse(current.get("source_url", "")).hostname != "drc.gd.gov.cn"):
            raise
        official_url, effective_date = current["source_url"], current["updated_at"]
    official = parse_official_prices(fetch_page(official_url))
    if effective_date < current.get("updated_at", ""):
        raise ValueError("源站公告落后于已发布价格，拒绝回滚")
    old = current_prices(current)
    price98 = old[2] if old and valid_price(old[2]) else None
    reference_date = current.get("reference_updated_at", "") if price98 is not None else ""
    reference_state = "retained" if price98 is not None else "unavailable"
    reference = fetch_reference_prices(reference_url)
    if reference:
        date, values = reference
        if effective_date <= date <= china_today() and all(abs(a-b) < 0.011 for a, b in zip(official, [values[0], values[1], values[3]])):
            price98, reference_date, reference_state = values[2], date, "synced"
    reference_status = {
        "synced": "第三方参考价已与本轮官方调价同步",
        "retained": "98#暂沿用最近一次参考价，请留意参考日期",
        "unavailable": "98#暂无可信参考价，其他官方价格正常更新",
    }[reference_state]
    notice = asdict(latest_notice) if latest_notice else current.get("latest_notice")
    data = {
        "schema_version": 2, "province": "广东", "city": "广州",
        "updated_at": effective_date, "checked_at": china_today(), "unit": "元/升",
        "price_type": "92#/95#/柴油为广东省最高零售价；98#" + ("为广州参考价" if reference_state == "synced" else "暂沿用最近一次广州参考价" if price98 is not None else "暂无可信参考价"),
        "items": [{"name": name, "price": price} for name, price in zip(PRICE_NAMES, [official[0], official[1], price98, official[2]])],
        "source": "广东省发改委最高零售价；98#为广州参考价", "source_url": official_url,
        "reference_source_url": reference_url, "reference_updated_at": reference_date,
        "reference_status": reference_status, "reference_state": reference_state,
        "official_status": "ok", "latest_notice": notice,
    }
    changed = save_snapshot(output, data)
    print(f"官方核对成功，公告 {effective_date}，价格 {official}；98# {reference_state}；文件变化={changed}")
    return changed


def record_failure(output: Path, error: Exception) -> int:
    current = load_current(output)
    old = current_prices(current)
    if old is None:
        print(f"::error::官方数据不可用且没有可信快照: {error}", file=sys.stderr)
        return 1
    validate_official([old[0], old[1], old[3]])
    age = days_since_update(output)
    stale = age is None or age >= STALE_ALERT_DAYS
    current.update(official_status="stale" if stale else "degraded", last_attempt_at=china_today(),
                   update_message="官方核对失败，显示上次成功数据")
    save_snapshot(output, current)
    severity = "error" if stale or not isinstance(error, NetworkError) else "warning"
    print(f"::{severity}::官方核对失败，未刷新 checked_at，距上次核对 {age} 天: {error}", file=sys.stderr)
    return int(severity == "error")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--official-index", default=OFFICIAL_INDEX_URL)
    parser.add_argument("--reference", default=REFERENCE_URL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        update_file(args.output, args.official_index, args.reference)
        return 0
    except (NetworkError, HTTPError, URLError, OSError, ValueError, UnicodeError) as exc:
        try:
            return record_failure(args.output, exc)
        except (OSError, ValueError, TypeError) as cache_error:
            print(f"::error::无法保留可信快照: {cache_error}; 原错误: {exc}", file=sys.stderr)
            return 1


if __name__ == "__main__":
    raise SystemExit(main())

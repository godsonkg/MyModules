#!/usr/bin/env python3
"""Fetch Guangdong fuel prices and update the repository JSON safely."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen


OFFICIAL_INDEX_URL = "https://drc.gd.gov.cn/spjg/index.html"
REFERENCE_URL = "https://oil.qqday.com/city/440100.htm"
DEFAULT_OUTPUT = Path("data/guangdong_fuel.json")
PRICE_NAMES = ("92#", "95#", "98#", "0# 柴油")
CHINA_TIME = timezone(timedelta(hours=8))


def china_today() -> str:
    return datetime.now(CHINA_TIME).strftime("%Y-%m-%d")


class NetworkError(Exception):
    """源站临时不可达（连接失败/超时/网关错误），属于基础设施问题而非数据/代码错误。"""


# 表示“源站或其网关临时故障”的状态码：重试后仍失败则软跳过，不视为代码/数据问题。
# 408 请求超时、429 频率限制、5xx 服务端错误，以及 Cloudflare 专有的 520-527
# （如 522 Origin Connection Time-out，本质就是回源连不上）。
TRANSIENT_HTTP_STATUSES = frozenset({408, 429}) | frozenset(range(500, 528))

# 数据陈旧超过该天数时，即便失败原因是“临时性”也升级为告警，
# 避免源站长期不可用被软跳过永久掩盖。国内成品油约每 10 个工作日调价一次，
# 取 45 天可在不误报的前提下兜住长期故障。
STALE_ALERT_DAYS = 45

# 列表页里的成品油价格公告标题，例如：
#   “2026年9月24日24时起成品油价格调整”“2026年3月9日24时起成品油价格按机制调整”
#   “2026年10月15日成品油价格不作调整”（本轮不调价，公告里没有价格表）
OFFICIAL_NOTICE_RE = re.compile(
    r'href=["\']([^"\']+)["\'][^>]*>\s*'
    r'(\d{4})年(\d{1,2})月(\d{1,2})日([^<]*成品油价格[^<]*调整[^<]*)'
)
NO_ADJUSTMENT_RE = re.compile(r"(?:不作|不予|暂不|暂停|不)调整")


@dataclass(frozen=True)
class OfficialNotice:
    url: str
    date: str
    title: str
    adjusted: bool


def fetch_page(url: str, *, retries: int = 3, backoff: float = 2.0) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; MyModules-FuelUpdater/1.0)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            with urlopen(request, timeout=30) as response:
                raw = response.read()
                charset = response.headers.get_content_charset() or "utf-8"
            return raw.decode(charset, errors="replace")
        except HTTPError as exc:
            # 4xx（404/403 等）说明地址或访问方式真的有问题，直接抛出告警；
            # 网关/服务端临时故障则与连接失败同等对待，重试。
            if exc.code not in TRANSIENT_HTTP_STATUSES:
                raise
            last_error = exc
            if attempt < retries:
                time.sleep(backoff * attempt)
        except (URLError, TimeoutError, OSError) as exc:
            # 连接层错误（如“Network is unreachable”/超时）多为临时抖动，重试。
            last_error = exc
            if attempt < retries:
                time.sleep(backoff * attempt)
    raise NetworkError(f"源站临时不可达，已重试 {retries} 次：{url} -> {last_error}")


def days_since_update(path: Path) -> int | None:
    """返回数据最近一次核对到的官方公告距今天数；无法判断时返回 None。

    优先用 latest_notice.date：遇到“不作调整”时 updated_at 不会前进，
    但只要还能核对到新公告，数据就不算陈旧。
    """
    try:
        current = load_current(path)
        notice = current.get("latest_notice") or {}
        checked = notice.get("date") or current.get("updated_at", "")
        recorded = datetime.strptime(str(checked), "%Y-%m-%d")
    except (OSError, ValueError, json.JSONDecodeError):
        return None
    return (datetime.now() - recorded).days


def page_text(page: str) -> str:
    # 先去掉脚本、样式和注释，避免页面里的 JS 文本被误当成正文匹配。
    page = re.sub(r"(?is)<(script|style)\b.*?</\1\s*>", " ", page)
    page = re.sub(r"(?s)<!--.*?-->", " ", page)
    text = re.sub(r"<[^>]+>", " ", page)
    return html.unescape(re.sub(r"\s+", " ", text))


def find_official_notices(index_page: str) -> list[OfficialNotice]:
    """按列表页顺序（新到旧）返回所有成品油价格公告，含“不作调整”公告。"""
    notices = []
    for match in OFFICIAL_NOTICE_RE.finditer(index_page):
        year, month, day = map(int, match.group(2, 3, 4))
        title = f"{year}年{month}月{day}日{html.unescape(match.group(5)).strip()}"
        notices.append(
            OfficialNotice(
                url=urljoin(OFFICIAL_INDEX_URL, match.group(1)),
                date=datetime(year, month, day).strftime("%Y-%m-%d"),
                title=title,
                adjusted=not NO_ADJUSTMENT_RE.search(title),
            )
        )
    return notices


def find_latest_notice(index_page: str) -> OfficialNotice | None:
    """最新一条成品油价格公告（可能是“不作调整”），用于记录核对状态。"""
    notices = find_official_notices(index_page)
    return notices[0] if notices else None


def find_latest_official_article(index_page: str) -> tuple[str, str]:
    """最近一次真正调价的公告。

    “不作调整”公告没有价格表，现行价格仍是上一次调价公告里的价格，
    所以要跳过它们，而不是拿去解析。
    """
    for notice in find_official_notices(index_page):
        # 公告常在下午发布，24 时才生效；增加抓取频次后不能提前展示新价。
        if "24时" in notice.title and notice.date >= china_today():
            continue
        if notice.adjusted:
            return notice.url, notice.date
    raise ValueError("未在广东省发改委列表找到最新成品油调价公告")


# 牌号标签兼容“92号汽油”“92#汽油”等写法；(?<!\d) 防止“10号柴油”误命中 0 号。
OFFICIAL_LABELS = (
    r"(?<!\d)92\s*[号#]\s*汽油",
    r"(?<!\d)95\s*[号#]\s*汽油",
    r"(?<!\d)0\s*[号#]\s*柴油",
)


def _official_price(text: str, label: str) -> float | None:
    # 标准价格表：牌号、两列元/吨价格、元/升零售价。
    match = re.search(
        label + r"[^0-9]{0,40}\d{4,5}\s+\d{4,5}\s+([0-9]+(?:\.[0-9]+)?)", text
    )
    if match:
        return round(float(match.group(1)), 2)
    # 兜底：表格排版变化时，取牌号之后一小段文字中第一个落在元/升合理区间的小数。
    label_match = re.search(label, text)
    if not label_match:
        return None
    window = text[label_match.end(): label_match.end() + 160]
    for value in re.findall(r"(?<![\d.])(\d{1,2}\.\d{1,2})(?![\d.])", window):
        price = float(value)
        if 4.0 <= price <= 20.0:
            return round(price, 2)
    return None


def parse_official_prices(page: str) -> list[float]:
    text = page_text(page)
    prices = []
    for label in OFFICIAL_LABELS:
        price = _official_price(text, label)
        if price is None:
            raise ValueError("广东省发改委公告的价格表解析不完整")
        prices.append(price)
    return prices


# 日期后可能带附加说明，例如：
#   “2026年9月13日，广州最新油价如下：”
#   “2026年10月15日起执行（展示日 2026年10月16日），广州最新油价如下：”
REFERENCE_DATE_RE = re.compile(
    r"(\d{4})年(\d{1,2})月(\d{1,2})日[^，,。]{0,40}[，,]\s*广州最新油价如下"
)
REFERENCE_GRADES = (("92", "汽油"), ("95", "汽油"), ("98", "汽油"), ("0", "柴油"))


def _reference_price(text: str, number: str, kind: str) -> float | None:
    label = rf"(?<!\d){number}\s*[号#]\s*{kind}"
    for pattern in (
        label + r"为\s*([0-9]+(?:\.[0-9]+)?)\s*元",  # 摘要句：92号汽油为8.63元
        label + r"\s+([0-9]+(?:\.[0-9]+)?)",  # 价格表：广州92#汽油 8.63
    ):
        match = re.search(pattern, text)
        if match:
            return round(float(match.group(1)), 2)
    return None


def parse_reference_prices(page: str) -> tuple[str, list[float]]:
    text = page_text(page)
    date_match = REFERENCE_DATE_RE.search(text)
    if not date_match:
        raise ValueError("未在数据源页面找到完整的广州油价字段")
    # 只在“广州最新油价如下”之后取价格，避免命中页面其他位置的数字。
    body = text[date_match.end():]
    prices = [_reference_price(body, number, kind) for number, kind in REFERENCE_GRADES]
    if any(price is None for price in prices):
        raise ValueError("未在数据源页面找到完整的广州油价字段")

    year, month, day = map(int, date_match.group(1, 2, 3))
    source_date = datetime(year, month, day).strftime("%Y-%m-%d")
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


def fetch_reference_prices(
    reference_url: str,
) -> tuple[str, list[float]] | None:
    """Best-effort fetch of the optional Guangzhou 98# reference price.

    The official Guangdong notice is authoritative for 92#/95#/diesel. The
    third-party page is only needed for 98#, so its outages and layout changes
    must not block official price updates.
    """
    try:
        return parse_reference_prices(fetch_page(reference_url))
    except (NetworkError, HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        print(
            f"::warning::第三方 98# 参考来源不可用，将沿用最近一次可信价格: {exc}",
            file=sys.stderr,
        )
        return None


def update_file(output: Path, official_index_url: str, reference_url: str) -> bool:
    index_page = fetch_page(official_index_url)
    official_url, effective_date = find_latest_official_article(index_page)
    latest_notice = find_latest_notice(index_page)
    official_92, official_95, official_diesel = parse_official_prices(
        fetch_page(official_url)
    )
    official = [official_92, official_95, official_diesel]
    current = load_current(output)
    existing_prices = current_prices(current)
    reference_result = fetch_reference_prices(reference_url)

    if reference_result is None:
        if existing_prices is None:
            raise ValueError("第三方 98# 参考来源不可用，且没有可沿用的历史 98# 参考价")
        price_98 = existing_prices[2]
        reference_date = current.get("reference_updated_at", "")
        price_type = "92#/95#/柴油为广东省最高零售价；98#暂沿用最近一次广州参考价"
        reference_status = "第三方参考来源本次不可用，98#暂沿用最近一次参考价"
    else:
        reference_date, reference_prices = reference_result
        reference_92, reference_95, reference_98, reference_diesel = reference_prices
        reference_comparable = [reference_92, reference_95, reference_diesel]
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
    checked_at = china_today()
    notice_record = (
        asdict(latest_notice) if latest_notice else current.get("latest_notice")
    )
    if (
        existing_prices == prices
        and current.get("price_type") == price_type
        and current.get("source_url") == official_url
        and current.get("reference_updated_at") == reference_date
        and current.get("latest_notice") == notice_record
        and current.get("checked_at") == checked_at
        and current.get("reference_status") == reference_status
    ):
        print(f"价格未变化，保留现有文件: {prices}")
        return False

    data = {
        "province": "广东",
        "city": "广州",
        "updated_at": effective_date,
        "checked_at": checked_at,
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
    if notice_record:
        data["latest_notice"] = notice_record
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
    except NetworkError as exc:
        # 临时网络问题：软跳过，数据保持不变，不标红，避免误报。
        # 但若数据已长期未更新，说明可能不再是“临时”问题，仍需告警。
        stale_days = days_since_update(args.output)
        if stale_days is not None and stale_days > STALE_ALERT_DAYS:
            print(
                f"油价更新失败：源站已持续不可用，且数据已 {stale_days} 天未更新"
                f"（超过 {STALE_ALERT_DAYS} 天阈值），请检查数据源: {exc}",
                file=sys.stderr,
            )
            return 1
        print(f"::warning::油价更新跳过（源站临时不可达，非代码错误）: {exc}")
        return 0
    except Exception as exc:
        # 解析/校验/HTTP 等真实异常：仍以失败退出，保留原数据并触发告警。
        print(f"油价更新失败，保留原数据: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

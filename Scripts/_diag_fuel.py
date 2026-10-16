"""临时诊断：打印官方列表与最新公告的原始结构，用于定位解析失败原因。合并前删除。"""
import re, sys
sys.path.insert(0, "Scripts")
import update_fuel as uf

idx = uf.fetch_page(uf.OFFICIAL_INDEX_URL)
print("=== INDEX anchors mentioning 油 ===")
for m in re.finditer(r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', idx, re.S):
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m.group(2))).strip()
    if "油" in t:
        print(m.group(1), "|", t)
try:
    url, date = uf.find_latest_official_article(idx)
except Exception as e:
    print("find_latest_official_article FAILED:", e); sys.exit(0)
print("=== MATCHED ===", url, date)
art = uf.fetch_page(url)
t = re.search(r"<title>(.*?)</title>", art, re.S)
print("TITLE:", t.group(1).strip() if t else None)
print("HAS <table>:", "<table" in art.lower())
for a in re.findall(r'(?:href|src)=["\']([^"\']+\.(?:pdf|docx?|xlsx?|wps|et|png|jpe?g|gif))["\']', art, re.I):
    print("ATTACH/IMG:", a)
txt = uf.page_text(art)
for kw in ("不作调整", "汽油", "柴油", "元/吨", "元/升"):
    print(f"kw {kw}: {txt.count(kw)}")
i = txt.find("汽油")
print("=== TEXT AROUND 汽油 ===")
print(txt[max(0, i - 600): i + 1500] if i >= 0 else txt[:2500])
m = re.search(r"<table.*?</table>", art, re.S | re.I)
if m:
    print("=== RAW TABLE (first 4000 chars) ===")
    print(m.group(0)[:4000])

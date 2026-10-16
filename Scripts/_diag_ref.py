"""临时诊断：打印第三方 98# 参考页结构。合并前删除。"""
import re, sys
sys.path.insert(0, "Scripts")
import update_fuel as uf
page = uf.fetch_page(uf.REFERENCE_URL)
print("LEN", len(page))
t = re.search(r"<title>(.*?)</title>", page, re.S)
print("TITLE:", t.group(1).strip() if t else None)
txt = uf.page_text(page)
for kw in ("最新油价", "92号", "95号", "98号", "0号", "柴油", "广州"):
    print(f"kw {kw}: {txt.count(kw)}")
for kw in ("最新油价", "98号"):
    i = txt.find(kw)
    print(f"=== TEXT AROUND {kw} ===")
    print(txt[max(0, i - 300): i + 900] if i >= 0 else "(not found)")
i = page.find("98")
print("=== RAW HTML AROUND first 98 ===")
print(page[max(0, i - 1500): i + 1500] if i >= 0 else "(no 98)")

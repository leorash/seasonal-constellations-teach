# -*- coding: utf-8 -*-
"""分析：每星座中心RA/Dec、最亮星、重点亮星、缺失连线端点，用于四季分组与数据补全。"""
import csv, json, math
from pathlib import Path

SRC = Path(r"C:\Users\hp\Desktop\AstroGames-main")
REGIONS = json.load(open(SRC / "data" / "star_catalog.json", encoding="utf-8"))

# 读 hip
HIP = {}
with open(SRC / "data" / "hip_main.csv", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        try:
            HIP[row["HIP"]] = (float(row["RAdeg"]), float(row["DEdeg"]), float(row["Vmag"]))
        except (KeyError, ValueError):
            pass

def mod360(x): return x % 360
def center_ra(b):
    if b["ra_min"] <= b["ra_max"]:
        return (b["ra_min"] + b["ra_max"]) / 2
    return mod360((b["ra_min"] + b["ra_max"] + 360) / 2)

print(f"{'key':22} {'cn':6} {'RAh':>4} {'Dec':>6} {'nN':>3}  brightest")
missing_line_hips = set()
for key, r in REGIONS.items():
    b = r["bounds"]
    ra = center_ra(b); dec = (b["dec_min"] + b["dec_max"])/2
    named = [s for s in r["stars"] if s.get("name_cn")]
    named.sort(key=lambda s: s["mag"])
    bright = ", ".join(f"{s['name_cn']}({s['mag']:.2f})" for s in named[:3])
    for a, b2 in r.get("lines", []):
        if a not in HIP: missing_line_hips.add(a)
        if b2 not in HIP: missing_line_hips.add(b2)
    print(f"{key:22} {r.get('display_name_cn','')[:6]:6} {ra/15:4.1f} {dec:6.1f} {len(named):3d}  {bright}")

print("\n缺失连线端点 hip（在 hip_main 中不存在或被裁掉的）:")
# 判断是 mag>6.5 还是完全不在
dark, gone = [], []
for h in sorted(missing_line_hips, key=lambda x: int(x) if x.isdigit() else 0):
    if h in HIP:
        ra, dec, mag = HIP[h]
        if mag > 6.5: dark.append((h, round(mag,2)))
        else: dark.append((h, "in-range?"))
    else:
        gone.append(h)
print("  在星表但 mag>6.5 等（需补入）:", len(dark), dark[:20])
print("  完全不在 hip_main:", len(gone), gone[:20])

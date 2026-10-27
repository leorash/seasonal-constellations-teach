# -*- coding: utf-8 -*-
"""
四季星空认星座 · 教学版数据构建
在 missing-star 裁剪基础上额外纳入每个星座的【命名星】与【星座连线端点星】，
即使它们落在矩形天区边界之外，保证星座连线形状完整。
仅依赖 Python 标准库。
"""
import csv
import json
from pathlib import Path

SRC = Path(r"C:\Users\hp\Desktop\AstroGames-main")
OUT = Path(__file__).resolve().parent.parent / "data"
OUT.mkdir(parents=True, exist_ok=True)
MAG_LIMIT = 6.5

REGIONS = json.load(open(SRC / "data" / "star_catalog.json", encoding="utf-8"))
KNOW_RAW = json.load(open(SRC / "data" / "star_knowledge.json", encoding="utf-8"))
KNOW = {k: v for k, v in KNOW_RAW.items() if not k.startswith("_") and isinstance(v, str)}

# 全量 hip
HIP = {}
with open(SRC / "data" / "hip_main.csv", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        try:
            HIP[row["HIP"]] = [round(float(row["RAdeg"]), 5),
                               round(float(row["DEdeg"]), 5),
                               round(float(row["Vmag"]), 3),
                               (round(float(row["B-V"]), 3) if row.get("B-V") not in (None, "",) else None)]
        except (KeyError, ValueError, TypeError):
            continue
try:
    HIP[list(HIP)[0]]  # noqa
except Exception:
    pass
# 上面 B-V 空值判断在 try 里；重新安全构建一次（B-V 空→None）
HIP = {}
with open(SRC / "data" / "hip_main.csv", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        try:
            bv = row.get("B-V", "")
            bv = round(float(bv), 3) if bv not in ("", None) else None
            HIP[row["HIP"]] = [round(float(row["RAdeg"]), 5),
                               round(float(row["DEdeg"]), 5),
                               round(float(row["Vmag"]), 3), bv]
        except (KeyError, ValueError, TypeError):
            continue


def contains_ra(b, ra):
    if b["ra_min"] <= b["ra_max"]:
        return b["ra_min"] <= ra <= b["ra_max"]
    return ra >= b["ra_min"] or ra <= b["ra_max"]


def ra_span(hips):
    if not hips:
        return 0.0
    ras = sorted(HIP[h][0] % 360 for h in hips if h in HIP)
    if len(ras) < 2:
        return 0.0
    gaps = [ras[i + 1] - ras[i] for i in range(len(ras) - 1)]
    gaps.append(ras[0] + 360 - ras[-1])
    return 360 - max(gaps)


def is_polar(b, hips):
    ds = [HIP[h][1] for h in hips if h in HIP]
    dmax = max(ds) if ds else b["dec_max"]
    dmin = min(ds) if ds else b["dec_min"]
    return dmax >= 85.0 or (dmin >= 70.0 and ra_span(hips) >= 120.0)


out_regions = {}
global_stars = {}
polar_keys = []
named_not_in_hip = []

for key, region in REGIONS.items():
    b = region["bounds"]
    # 1) 背景星：bounds 内 mag<=6.5
    base = [h for h, g in HIP.items()
            if g[2] <= MAG_LIMIT and b["dec_min"] <= g[1] <= b["dec_max"] and contains_ra(b, g[0])]
    polar = is_polar(b, base)
    if polar:
        base = [h for h, g in HIP.items()
                if g[2] <= MAG_LIMIT and b["dec_min"] <= g[1] <= b["dec_max"]]

    hipset = set(base)
    # 2) 命名星（确保都在）
    for s in region["stars"]:
        h = s.get("catalog_id", "").replace("HIP", "").strip()
        if not h:
            continue
        if h in HIP:
            hipset.add(h)
        else:
            named_not_in_hip.append((key, s.get("name_cn"), h))

    # 3) 连线端点星（确保星座形状完整）
    for seg in region.get("lines", []):
        for h in seg:
            if h in HIP:
                hipset.add(h)

    # 汇总到全局表
    for h in hipset:
        if h not in global_stars and h in HIP:
            global_stars[h] = HIP[h]

    # 星列表按 mag 降序（暗→亮），与原版绘制顺序一致
    ordered = sorted(hipset, key=lambda h: HIP[h][2] if h in HIP else 99, reverse=True)

    named = [{
        "id": s["id"],
        "hip": s.get("catalog_id", "").replace("HIP", "").strip(),
        "cn": s.get("name_cn", ""),
        "en": s.get("name_en", ""),
        "mag": s.get("mag"),
        "ra": s.get("ra"),
        "dec": s.get("dec"),
        "color": s.get("color", "#dce8ff"),
        "con": s.get("constellation", ""),
    } for s in region["stars"]]

    out_regions[key] = {
        "n": region.get("display_name_cn") or region.get("display_name_en") or key,
        "ne": region.get("display_name_en", ""),
        "b": [round(b["ra_min"], 4), round(b["ra_max"], 4), round(b["dec_min"], 4), round(b["dec_max"], 4)],
        "l": region.get("lines", []),
        "stars": ordered,
        "named": named,
        "polar": polar,
    }
    if polar:
        polar_keys.append(key)

payload = {
    "magLimit": MAG_LIMIT,
    "polarRegions": polar_keys,
    "regions": out_regions,
    "stars": global_stars,
    "knowledge": KNOW,
}
with (OUT / "data.js").open("w", encoding="utf-8") as f:
    f.write("/* 自动生成，请勿手改。tools/build_data.py 从 star_catalog.json / hip_main.csv 构建。 */\n")
    f.write("window.ASTRO_DATA = ")
    json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

total_ref = sum(len(r["stars"]) for r in out_regions.values())
print(f"区域 {len(out_regions)}  极区 {polar_keys}")
print(f"去重星 {len(global_stars)}  区域引用合计 {total_ref}")
print(f"科普词条 {len(KNOW)}  数据大小 { (OUT/'data.js').stat().st_size/1024:.1f} KB")
print("命名星不在 hip_main 的:", named_not_in_hip)
# 校验：现在每区域连线端点是否都已在其星列表
miss = 0
for key, r in out_regions.items():
    hs = set(r["stars"])
    for a, b2 in r["l"]:
        if a not in hs or b2 not in hs:
            miss += 1
print("仍缺失连线端点段数:", miss)

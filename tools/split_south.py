# -*- coding: utf-8 -*-
"""按赤纬划分南天星座：北京 ~40°N，dec<-50 永不升起；以中心 dec<-40 为典型南天。
   数据直接读取成品自带的 data.js。"""
import json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

txt = open("data/data.js", encoding="utf-8").read()
start = txt.index("window.ASTRO_DATA") + len("window.ASTRO_DATA")
start = txt.index("{", start)
D = json.loads(txt[start:txt.rfind("}") + 1])

rows = []
for key, r in D["regions"].items():
    ra0, ra1, d0, d1 = r["b"]
    cdec = (d0 + d1) / 2
    named = sorted([s for s in r["named"] if s.get("cn")], key=lambda s: s["mag"])
    br = named[0] if named else None
    rows.append((key, r["n"], cdec, d0, d1, br["cn"] if br else "", br["dec"] if br else 0))

print("===== 中心 dec < -40（典型南天，北京基本不可见）=====")
south = [x for x in rows if x[2] < -40]
for x in sorted(south, key=lambda z: z[2]):
    print(f"{x[0]:22} {x[1]:5} 中心{x[2]:6.1f} 范围[{x[3]:6.1f},{x[4]:6.1f}] 最亮{x[5]} dec{x[6]:.1f}")
print("共", len(south))

print("\n===== 边界 -40 ~ -30（人工确认保留四季）=====")
for x in sorted(rows, key=lambda z: z[2]):
    if -40 <= x[2] < -30:
        print(f"{x[0]:22} {x[1]:5} 中心{x[2]:6.1f} 范围[{x[3]:6.1f},{x[4]:6.1f}] 最亮{x[5]} dec{x[6]:.1f}")

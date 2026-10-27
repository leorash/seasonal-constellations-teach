# -*- coding: utf-8 -*-
import json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
d = json.load(open("data/data.js".replace("data.js","") + "data/data.js", encoding="utf-8")) if False else None
# 直接读 data.js 里的 JSON
txt = open("data/data.js", encoding="utf-8").read()
start = txt.index("window.ASTRO_DATA") + len("window.ASTRO_DATA")
start = txt.index("{", start)
obj = json.loads(txt[start:txt.rfind("}")+1])
allkeys = set(obj["regions"].keys())
groups = {
"polar": ["ursa_major","ursa_minor","cepheus","cassiopeia","draco"],
"spring": ["bootes","leo","leo_minor","cancer","lynx","canes_venatici","virgo","corvus","crater","hydra","centaurus","crux","musca"],
"summer": ["circinus","corona_borealis","apus","libra","lupus","triangulum_australe","scorpius","serpens","ophiuchus","ara","hercules","telescopium","scutum","sagittarius","lyra","pavo","aquila","sagitta","cygnus","indus"],
"autumn": ["delphinus","capricornus","equuleus","octans","aquarius","grus","lacerta","tucana","pegasus","piscis_austrinus","andromeda","pisces","phoenix","cetus","triangulum","aries","perseus","hydrus"],
"winter": ["reticulum","horologium","eridanus","fornax","dorado","taurus","columba","lepus","auriga","orion","pictor","canis_major","gemini","monoceros","canis_minor","puppis","volans","pyxis","carina","vela"],
}
seen = []
for g, ks in groups.items():
    print(g, len(ks))
    seen += ks
seen = set(seen)
print("分组总数:", len(seen))
print("缺少:", allkeys - seen)
print("多余:", seen - allkeys)

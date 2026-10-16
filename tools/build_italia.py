#!/usr/bin/env python3
"""Costruisce frontend/public/italia.json: regioni (aree) e confini delle province (linee), semplificati.

È la mappa "di riserva" interna all'app: si usa quando le mappe di OpenFreeMap non si caricano
(rete, firewall, servizio giù). Dati: ISTAT, via openpolis/geojson-italy (licenza CC-BY 4.0).

Serve solo a chi sviluppa (il file è già nello zip):
    pip install shapely
    python tools/build_italia.py
"""
import json
import sys
import urllib.request
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

BASE = "https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/"
OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "italia.json"
TOLERANCE = 0.012  # gradi (circa 1 km): abbastanza preciso per una mappa d'insieme


def load(name: str, local: str | None) -> dict:
    if local:
        return json.loads(Path(local).read_text(encoding="utf-8"))
    with urllib.request.urlopen(BASE + name, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def rounded(geom: dict) -> dict:
    def rnd(c):
        return [round(c[0], 3), round(c[1], 3)] if isinstance(c[0], (int, float)) else [rnd(x) for x in c]
    return {"type": geom["type"], "coordinates": rnd(geom["coordinates"])}


def main(argv: list[str]) -> None:
    regions = load("limits_IT_regions.geojson", argv[0] if argv else None)
    provinces = load("limits_IT_provinces.geojson", argv[1] if len(argv) > 1 else None)

    reg_features = []
    for f in regions["features"]:
        g = shape(f["geometry"]).simplify(TOLERANCE, preserve_topology=True)
        if g.is_empty:
            continue
        reg_features.append({"type": "Feature", "properties": {"name": f["properties"]["reg_name"]},
                             "geometry": rounded(mapping(g))})

    # confini interni delle province come linee (meno peso delle aree)
    prov_lines = []
    for f in provinces["features"]:
        g = shape(f["geometry"]).simplify(TOLERANCE, preserve_topology=True).boundary
        prov_lines.append(g)
    merged = unary_union(prov_lines).simplify(TOLERANCE)
    prov_feature = {"type": "Feature", "properties": {}, "geometry": rounded(mapping(merged))}

    out = {
        "attribution": "Confini © ISTAT (CC-BY)",
        "regions": {"type": "FeatureCollection", "features": reg_features},
        "provinces": {"type": "FeatureCollection", "features": [prov_feature]},
    }
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"Scritto {OUT} ({OUT.stat().st_size // 1024} KB): {len(reg_features)} regioni")


if __name__ == "__main__":
    main(sys.argv[1:])

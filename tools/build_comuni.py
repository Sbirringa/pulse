#!/usr/bin/env python3
"""Rigenera l'elenco dei comuni italiani con coordinate (serve solo se cambiano i comuni).

Fonte: confini amministrativi ISTAT, pubblicati da openpolis/geojson-italy
       https://github.com/openpolis/geojson-italy — licenza CC-BY 4.0 (© ISTAT).
Per ogni comune calcola il baricentro del poligono principale.

Uscita (stesso contenuto, due copie):
  backend/app/data/comuni.json    → il server valida le città
  frontend/public/comuni.json     → il browser cerca i comuni e li mette sulla mappa, senza servizi esterni

Formato compatto: {"fields": [...], "items": [[nome, sigla, regione, lat, lon, capoluogo], ...]}

    python tools/build_comuni.py [percorso/limits_IT_municipalities.geojson]
"""
import json
import sys
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = "https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_municipalities.geojson"
# Nomi ISTAT ufficiali → nome con cui le persone li cercano (e già usato nell'app)
ALIASES = {"Reggio di Calabria": "Reggio Calabria", "Reggio nell'Emilia": "Reggio Emilia", "Bolzano/Bozen": "Bolzano"}
EXTRA_CAPOLUOGHI = {"Aosta"}


def is_capoluogo(istat_name: str, prov_name: str) -> bool:
    """Il comune dà il nome alla provincia (anche "Forlì-Cesena", "Monza e della Brianza", "Bolzano/Bozen")."""
    base = istat_name.split("/")[0]
    parts = [x.strip() for x in prov_name.replace(" e della ", "-").replace("/", "-").split("-")]
    return base in EXTRA_CAPOLUOGHI or base == prov_name or base in parts or prov_name.startswith(base + " ")


def ring_centroid(ring):
    """Baricentro di un anello (shoelace). Per aree piccole lat/lon vanno benissimo."""
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        cross = x1 * y2 - x2 * y1
        a += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if abs(a) < 1e-12:
        xs, ys = zip(*ring)
        return sum(xs) / len(xs), sum(ys) / len(ys), 0.0
    return cx / (3 * a), cy / (3 * a), abs(a) / 2


def centroid(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    best = max((ring_centroid(p[0]) for p in polys), key=lambda c: c[2])  # poligono più grande
    return round(best[1], 5), round(best[0], 5)


def main() -> None:
    if len(sys.argv) > 1:
        data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    else:
        print("Scarico i confini ISTAT (35 MB)…")
        with urllib.request.urlopen(URL, timeout=120) as r:
            data = json.loads(r.read().decode("utf-8"))
    rows = []
    for f in data["features"]:
        p = f["properties"]
        name = ALIASES.get(p["name"], p["name"])
        lat, lon = centroid(f["geometry"])
        capoluogo = 1 if is_capoluogo(p["name"], p["prov_name"]) or is_capoluogo(name, p["prov_name"]) else 0
        rows.append([name, p["prov_acr"], p["reg_name"], lat, lon, capoluogo])
    # nomi uguali in province diverse: si distinguono con la sigla, es. "Calliano (TN)"
    counts = Counter(r[0] for r in rows)
    for r in rows:
        if counts[r[0]] > 1:
            r[0] = f"{r[0]} ({r[1]})"
    rows.sort(key=lambda r: r[0])
    out = {"source": "ISTAT, confini amministrativi (CC-BY 4.0) via openpolis/geojson-italy",
           "fields": ["nome", "sigla", "regione", "lat", "lon", "capoluogo"], "items": rows}
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    for target in (ROOT / "backend/app/data/comuni.json", ROOT / "frontend/public/comuni.json"):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        print(f"Scritto {target} ({len(rows)} comuni, {len(text) // 1024} KB)")


if __name__ == "__main__":
    main()

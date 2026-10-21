"""Michigan county boundaries (Census TIGERweb), cached, with point-in-county tests."""

from __future__ import annotations

import json
import re
from pathlib import Path

import requests

TIGER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query"
CACHE = Path(__file__).resolve().parents[2] / "data" / "cache" / "mi-counties.geojson"
MI_BBOX = (-90.5, 41.6, -82.1, 48.4)


def norm_county(s) -> str:
    """'GR TRAVERSE', 'St. Clair', 'Grand Traverse County' -> one spelling."""
    s = re.sub(r"\s+", " ", re.sub(r"[^\w ]", " ", str(s or "").upper())).strip()
    s = s.replace(" COUNTY", "").replace("SAINT ", "ST ")
    return re.sub(r"^GR ", "GRAND ", s)


def load() -> dict[str, dict]:
    """{normalized county name: GeoJSON geometry}"""
    if not CACHE.exists():
        fc = requests.get(TIGER, params={"where": "STATE='26'", "outFields": "BASENAME",
                                         "maxAllowableOffset": 0.001, "outSR": 4326, "f": "geojson"},
                          timeout=120).json()
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(fc, separators=(",", ":")))
    fc = json.loads(CACHE.read_text())
    return {norm_county(f["properties"]["BASENAME"]): f["geometry"] for f in fc["features"]}


def _in_ring(x: float, y: float, ring) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def contains(geom: dict, x: float, y: float) -> bool:
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return any(_in_ring(x, y, p[0]) and not any(_in_ring(x, y, h) for h in p[1:]) for p in polys)


def bbox(geom: dict) -> tuple[float, float, float, float]:
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    xs = [pt[0] for p in polys for pt in p[0]]
    ys = [pt[1] for p in polys for pt in p[0]]
    return min(xs), min(ys), max(xs), max(ys)

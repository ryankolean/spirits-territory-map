"""Validate every match the pipeline makes and write docs/VALIDATION.md.

1. Purchase file vs master license list, joined on license number.
2. 2021-2024 PDF rows mapped NN-XXXXXX -> L-000XXXXXX.
3. Each pin inside the county MLCC lists for it (Census TIGERweb boundaries).
4. Pins vs the City of Detroit's geocoded liquor licenses.
5. Output integrity of public/data/locations.geojson.

Run: uv run python -m stm.crosscheck
"""

from __future__ import annotations

import json
import math
import re
import subprocess
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import requests

from stm import counties
from stm.build import OUT, RAW, ROOT, load_master
from stm.history import ALL_SALES_PDF, PREFIX_CLASS, ROW
from stm.parse import FILES_2025, parse_file

DETROIT = "https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/Liquor_Licenses/FeatureServer/0/query"
MI_BBOX = counties.MI_BBOX


def norm(s) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w ]", " ", str(s or "").upper())).strip()


def street_zip(addr: str) -> tuple[str, str]:
    a = re.sub(r"\s+UNITED STATES$", "", (addr or "").upper().strip())
    parts = [p.strip() for p in a.split(",")]
    z = re.search(r"\b(\d{5})", parts[-1]) if parts else None
    return norm(parts[0]) if parts else "", z.group(1) if z else ""


def city_of(addr: str) -> str:
    parts = [p.strip() for p in (addr or "").split(",")]
    return norm(parts[-2]) if len(parts) >= 3 else ""


def miles(a, b) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 3958.8 * math.asin(math.sqrt(h))


def pct(n: int, d: int) -> str:
    return f"{100 * n / d:.1f}%" if d else "n/a"


def main() -> None:
    md: list[str] = []
    w = md.append
    w("# Data validation\n")
    w(f"Generated {date.today().isoformat()} by `make crosscheck` (`pipeline/stm/crosscheck.py`). "
      "Each section checks one match the pipeline makes.\n")

    recs = {}
    for klass, (alpha, _) in FILES_2025.items():
        r, _ = parse_file(RAW / "2025" / alpha, klass)
        recs.update(r)
    master, _ = load_master()

    # 1. Purchase file vs master list
    joined = [(L, master[(L.license, L.license_type)]) for L in recs.values()
              if (L.license, L.license_type) in master]
    lara = sum(1 for L, m in joined if str(m["lara"] or "").lstrip("0") == str(L.lara_id or "").lstrip("0"))
    same_addr = sum(1 for L, m in joined if street_zip(L.address) == street_zip(m["address"]))
    same_zip = sum(1 for L, m in joined if street_zip(L.address)[1] == street_zip(m["address"])[1])
    same_county = sum(1 for L, m in joined
                      if counties.norm_county(L.county) == counties.norm_county(m["county"]))
    dba_conflict = [(L, m) for L, m in joined if L.dba and m["dba"] and norm(L.dba) != norm(m["dba"])]
    w("## 1. Purchase files joined to the master license list\n")
    w(f"{len(joined):,} of {len(recs):,} purchase-file licenses found in the master list by license number and type. "
      "For each joined pair, the other identifying fields should agree:\n")
    w("| Field compared | Agree | Share |")
    w("| --- | --- | --- |")
    w(f"| LARA business ID | {lara:,} | {pct(lara, len(joined))} |")
    w(f"| County | {same_county:,} | {pct(same_county, len(joined))} |")
    w(f"| ZIP code | {same_zip:,} | {pct(same_zip, len(joined))} |")
    w(f"| Street address (normalized) | {same_addr:,} | {pct(same_addr, len(joined))} |")
    w(f"| DBA (where both name one) | {len(joined) - len(dba_conflict):,} | {pct(len(joined) - len(dba_conflict), len(joined))} |")
    w("")
    bad_id = [(L, m) for L, m in joined if str(m["lara"] or "").lstrip("0") != str(L.lara_id or "").lstrip("0")]
    if bad_id:
        w(f"Business ID disagreements ({len(bad_id)}), first five:\n")
        for L, m in bad_id[:5]:
            w(f"- `{L.license}` purchase file {L.lara_id} ({L.account}) vs master {m['lara']}")
        w("")
    w(f"Street addresses differ mostly in formatting the normalizer does not fold (suite numbers, \"Hwy\" vs "
      f"\"Highway\"); ZIP agreement is the stronger signal. DBA differences are names updated after a rebrand "
      f"or sale; the map shows the master list's DBA. Examples:\n")
    for L, m in dba_conflict[:5]:
        w(f"- `{L.license}` purchase file \"{L.dba}\", master \"{m['dba']}\"")
    w("")

    # 2. History mapping
    w("## 2. 2021-2024 history mapped to 2025 licenses\n")
    w("Old report rows (`NN-XXXXXX`) map to `L-000XXXXXX` within the class the prefix names (01 and 05 Class C, "
      "02 and 06 B-Hotel, 10 and 15 SDD). A correct mapping should keep the business ID (unless the license "
      "changed owners) and the city.\n")
    w("| Year | Report rows | Mapped to a 2025 license | Same business ID | Same city | Mapped dollars |")
    w("| --- | --- | --- | --- | --- | --- |")
    for y, rel in ALL_SALES_PDF.items():
        text = subprocess.run(["pdftotext", "-layout", str(RAW / rel), "-"],
                              capture_output=True, text=True, check=True).stdout
        rows = [m for m in (ROW.match(l) for l in text.splitlines()) if m]
        mapped = same_id = same_city = 0
        dollars = 0.0
        for m in rows:
            L = recs.get(f"L-000{m.group(2)}")
            if not L or PREFIX_CLASS.get(m.group(1)) != L.klass:
                continue
            mapped += 1
            dollars += float(m.group(6).replace(",", "")) * (-1 if m.group(7) else 1)
            if m.group(3) and m.group(3).lstrip("0") == str(L.lara_id or "").lstrip("0"):
                same_id += 1
            if m.group(4) and norm(m.group(4)) == city_of(L.address):
                same_city += 1
        w(f"| {y} | {len(rows):,} | {mapped:,} ({pct(mapped, len(rows))}) | {pct(same_id, mapped)} | "
          f"{pct(same_city, mapped)} | ${dollars:,.0f} |")
    w("\nRows that do not map are licenses that closed before 2025. City disagreements are mostly mailing "
      "city versus municipality (\"Township\" names, unincorporated places).\n")

    # 3. Pins inside their county
    fc = json.loads((OUT / "locations.geojson").read_text())
    feats = fc["features"]
    poly = counties.load()
    by_q = defaultdict(lambda: [0, 0])
    outside = []
    for f in feats:
        p = f["properties"]
        x, y = f["geometry"]["coordinates"]
        g = poly.get(counties.norm_county(p["co"]))
        ok = bool(g) and counties.contains(g, x, y)
        q = {2: "Census exact", 1: "Census interpolated or OSM", 0: "ZIP-code center"}[p["q"]]
        by_q[q][0] += ok
        by_q[q][1] += 1
        if not ok:
            outside.append(p)
    w("## 3. Pins inside the county MLCC lists\n")
    w(f"Each pin tested against Census TIGERweb county boundaries ({len(poly)} Michigan counties).\n")
    w("| Geocode quality | Pins | Inside listed county | Share |")
    w("| --- | --- | --- | --- |")
    tot_ok = tot = 0
    for q in ("Census exact", "Census interpolated or OSM", "ZIP-code center"):
        ok, n = by_q[q]
        tot_ok, tot = tot_ok + ok, tot + n
        w(f"| {q} | {n:,} | {ok:,} | {pct(ok, n)} |")
    w(f"| All | {tot:,} | {tot_ok:,} | {pct(tot_ok, tot)} |")
    w("\nOpenStreetMap and ZIP-center pins outside their county are re-placed or rejected by the build "
      "(`geocode.repair`). The rest are Census matches on county-line roads (8 Mile, Dequindre) or in "
      "cities that straddle a county line (Holland, Milan), within feet of the line. Largest buyers first:\n")
    for p in sorted(outside, key=lambda p: -p["d"])[:8]:
        w(f"- `{p['id']}` {p['n']}, {p['a']} (listed {p['co'].title()}, quality {p['q']}, ${p['d']:,})")
    w("")

    # 4. Detroit
    rows = []
    for off in (0, 2000):
        r = requests.get(DETROIT, params={"where": "1=1", "outFields": "street_address,zip_code,latitude,longitude",
                                          "resultOffset": off, "resultRecordCount": 2000, "f": "json"},
                         timeout=60).json()
        rows += [f["attributes"] for f in r["features"]]
    det = {(norm(a["street_address"]), str(a["zip_code"])[:5]): (a["longitude"], a["latitude"])
           for a in rows if a["street_address"] and a["latitude"]}
    dists = sorted(miles(f["geometry"]["coordinates"], det[k])
                   for f in feats
                   if (k := street_zip(f["properties"]["a"])) in det)
    w("## 4. Detroit pins vs the City of Detroit's geocoded licenses\n")
    if dists:
        q = lambda p: dists[min(len(dists) - 1, int(p * len(dists)))] * 5280
        w(f"Matched on street address and ZIP: {len(dists):,} locations. Distance from our pin to the city's "
          f"point: median {q(.5):,.0f} ft, 90th percentile {q(.9):,.0f} ft, 99th percentile {q(.99):,.0f} ft; "
          f"{sum(1 for d in dists if d > .25)} over a quarter mile. "
          "[Source](https://data.detroitmi.gov/datasets/detroitmi::liquor-licenses-current)\n")

    # 5. Output integrity
    ids = Counter(f["properties"]["id"] for f in feats)
    in_mi = sum(1 for f in feats if MI_BBOX[0] <= f["geometry"]["coordinates"][0] <= MI_BBOX[2]
                and MI_BBOX[1] <= f["geometry"]["coordinates"][1] <= MI_BBOX[3])
    series_ok = sum(1 for f in feats if f["properties"]["y"][-1] == f["properties"]["d"])
    kept_dollars = sum(f["properties"]["d"] for f in feats)
    w("## 5. Output integrity\n")
    w("| Check | Result |")
    w("| --- | --- |")
    w(f"| Locations in `locations.geojson` | {len(feats):,} |")
    w(f"| Duplicate license numbers | {sum(1 for n in ids.values() if n > 1)} |")
    w(f"| Pins inside Michigan's bounding box | {in_mi:,} of {len(feats):,} |")
    w(f"| Latest year of the series equals the pin's dollars | {series_ok:,} of {len(feats):,} |")
    w(f"| 2025 dollars on the map | ${kept_dollars:,} |")
    w("")

    (ROOT / "docs" / "VALIDATION.md").write_text("\n".join(md))
    print("\n".join(md))


if __name__ == "__main__":
    main()

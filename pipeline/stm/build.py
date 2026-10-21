"""Join purchases, license status, history and geocodes into the app's data.

Writes public/data/locations.geojson and public/data/meta.json.
Run: uv run python -m stm.build
"""

from __future__ import annotations

import json
import math
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import openpyxl

from stm.geocode import geocode, norm_key
from stm.history import ALL_SALES_PDF, parse_pdf
from stm.parse import FILES_2025, parse_file

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"
YEARS = [2021, 2022, 2023, 2024, 2025]
KEEP_STATUS = {"Active", "Conditional"}
CLASS_CODE = {"SDD": "S", "C": "C", "B-Hotel": "H"}
VIEWS = {"bars": {"C", "H"}, "stores": {"S"}}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def load_master() -> tuple[dict[str, dict], str]:
    """The master list is whichever license-list workbook has a Number column.

    MLCC's licensing page has the Master List and Social District links
    swapped, so the filename cannot be trusted.
    """
    for path in sorted(RAW.glob("*.xlsx")):
        ws = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
        rows = ws.iter_rows(values_only=True)
        banner = next(rows)[0]
        hdr = next(rows)
        if "Number" in hdr and "Status" in hdr:
            H = {h: i for i, h in enumerate(hdr)}
            out = {}
            for r in rows:
                num = str(r[H["Number"]] or "").strip()
                if not num:
                    continue
                # 144 numbers repeat; an active row wins over an escrowed one.
                if out.get(num, {}).get("status") in KEEP_STATUS:
                    continue
                out[num] = {"status": r[H["Status"]], "dba": r[H["DBA"]] or None}
            return out, str(banner).replace("Updated ", "")
    sys.exit("no license-list workbook with a Number column found in data/raw")


def nice(x: float) -> int:
    """Round to a clean cutoff: 2 significant figures, ending in 0 or 5."""
    if x <= 0:
        return 0
    mag = 10 ** (int(math.log10(x)) - 1)
    return int(round(x / mag / 5) * 5 * mag) or int(mag)


def pct(values: list[float], p: float) -> float:
    s = sorted(values)
    return s[min(len(s) - 1, int(p * len(s)))]


def main() -> None:
    log = []
    p = lambda *a: (print(*a), log.append(" ".join(str(x) for x in a)))

    recs = {}
    for klass, (alpha, _county) in FILES_2025.items():
        r, s = parse_file(RAW / "2025" / alpha, klass)
        p(f"2025 {klass}: {s['licenses']} licenses, ${s['sum']:,.2f}")
        recs.update(r)

    master, list_date = load_master()
    p(f"master list ({list_date}): {len(master)} license numbers")

    history: dict[int, dict[str, float]] = {}
    for y, rel in ALL_SALES_PDF.items():
        h, s = parse_pdf(RAW / rel)
        if not s["reconciled"]:
            sys.exit(f"{y} history does not reconcile: {s}")
        history[y] = h
        p(f"{y}: {s['rows']} rows, ${s['sum']:,.2f} (footer ${s['adj_sales']:,.2f})")

    cache = geocode(sorted({L.address for L in recs.values() if L.address}),
                    ROOT / "data" / "cache" / "geocode.csv")

    kept, dropped = [], []
    for L in recs.values():
        m = master.get(L.license)
        (kept if m and m["status"] in KEEP_STATUS else dropped).append(L)
    p(f"kept {len(kept)} active/conditional, dropped {len(dropped)} "
      f"(${sum(L.dollars for L in dropped):,.0f} of 2025 dollars)")

    # 2025 dollars of dropped licenses at the same address and class, so a
    # new owner's partial year can be read against the location's history.
    gone = defaultdict(float)
    for L in dropped:
        gone[(L.klass, norm_key(L.address or ""))] += L.dollars

    features, geo = [], Counter()
    for L in kept:
        g = cache.get(norm_key(L.address or ""), {})
        if g.get("status") != "Match":
            geo["none"] += 1
            continue
        geo[g["quality"]] += 1
        series = [history[y].get(L.license) for y in YEARS[:-1]] + [L.dollars]
        series = [round(v) if v is not None else None for v in series]
        m = master[L.license]
        props = {
            "id": L.license,
            "n": m["dba"] or L.dba or L.account,
            "o": L.account,
            "c": CLASS_CODE[L.klass],
            "r": 1 if (L.license_type or "").endswith("Resort") else 0,
            "a": L.address,
            "co": L.county,
            "lg": L.lgu,
            "d": round(L.dollars),
            "y": series,
            # 2 exact Census match, 1 interpolated or OSM, 0 ZIP-code center.
            "q": {"Exact": 2, "ZIP": 0}.get(g["quality"], 1),
        }
        if L.months:
            first = min(MONTHS.index(k.split()[0]) for k in L.months)
            if first > 0:
                props["since"] = MONTHS[first]
        prior = gone.get((L.klass, norm_key(L.address or "")))
        if prior:
            props["pv"] = round(prior)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(g["lng"]), float(g["lat"])]},
            "properties": props,
        })
    p(f"features {len(features)}; geocode quality {dict(geo)}")

    tiers = {}
    for view, classes in VIEWS.items():
        vals = [f["properties"]["d"] for f in features
                if f["properties"]["c"] in classes and f["properties"]["d"] > 0]
        tiers[view] = {
            "cutoffs": [nice(pct(vals, q)) for q in (0.5, 0.8, 0.97)],
            "max": nice(pct(vals, 0.99)),
            "count": sum(1 for f in features if f["properties"]["c"] in classes),
        }
        p(f"{view}: {tiers[view]}")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "locations.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))
    (OUT / "meta.json").write_text(json.dumps({
        "purchaseYear": 2025,
        "years": YEARS,
        "licenseListDate": list_date,
        "built": date.today().isoformat(),
        "tiers": tiers,
    }, indent=2))
    (ROOT / "data" / "build-log.txt").write_text("\n".join(log) + "\n")


if __name__ == "__main__":
    main()

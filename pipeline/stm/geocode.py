"""Geocode premises addresses with the US Census batch geocoder, cached.

Cache: data/cache/geocode.csv, keyed by normalized address. Reruns only send
addresses not already in the cache. Misses get a second pass with a cleaned
street line (unit/suite/floor and "& 1740"-style ranges removed).
"""

from __future__ import annotations

import csv
import io
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"
CHUNK = 1000
WORKERS = 4
CACHE_FIELDS = ["key", "status", "quality", "matched", "lat", "lng", "pass"]


def norm_key(address: str) -> str:
    return re.sub(r"\s+", " ", address.upper()).strip()


def split_address(address: str) -> tuple[str, str, str, str] | None:
    """'123 Main St, Royal Oak, MI 48067-3293' -> (street, city, state, zip)."""
    parts = [p.strip() for p in address.split(",")]
    if len(parts) < 3:
        return None
    m = re.match(r"^([A-Z]{2})\s+(\d{5})(?:-\d{4})?", parts[-1].upper())
    if not m:
        return None
    return ", ".join(parts[:-2]), parts[-2], m.group(1), m.group(2)


def clean_street(street: str) -> str:
    s = street.upper()
    s = re.sub(r"^(\d+[A-Z]?)\s*(?:&|-|AND)\s*\d+[A-Z]?\b", r"\1", s)  # 1732 & 1740 W MAPLE
    s = re.sub(r"\b(STE|SUITE|UNIT|APT|BLDG|BUILDING|RM|ROOM|SPACE|LOT|#)\s*[\w-]+", "", s)
    s = re.sub(r"\b(FIRST|SECOND|THIRD|1ST|2ND|3RD|GROUND|LOWER|UPPER|MAIN)\s+(FLOOR|FLR|LEVEL)\b", "", s)
    s = re.sub(r"\bFLOOR\s*\d+\b|\b\d+(ST|ND|RD|TH)\s+FLOOR\b", "", s)
    s = re.sub(r"\s+", " ", s).strip(" ,")
    return s


def _post(rows: list[tuple[str, str, str, str, str]]) -> list[list[str]]:
    buf = io.StringIO()
    csv.writer(buf).writerows(rows)
    for attempt in range(4):
        try:
            r = requests.post(
                URL,
                files={"addressFile": ("a.csv", buf.getvalue(), "text/csv")},
                data={"benchmark": "Public_AR_Current"},
                timeout=600,
            )
            r.raise_for_status()
            return list(csv.reader(io.StringIO(r.text)))
        except requests.RequestException as e:
            print(f"  retry {attempt + 1}: {e}", file=sys.stderr)
            time.sleep(10 * (attempt + 1))
    raise RuntimeError("census geocoder failed after retries")


def load_cache(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    with path.open(newline="") as f:
        return {r["key"]: r for r in csv.DictReader(f)}


def save_cache(path: Path, cache: dict[str, dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CACHE_FIELDS)
        w.writeheader()
        for k in sorted(cache):
            w.writerow(cache[k])


def _run_pass(todo: dict[str, tuple[str, str, str, str]], pass_no: int) -> dict[str, dict]:
    keys = list(todo)
    ids = {str(i): k for i, k in enumerate(keys)}
    rows = [(str(i), *todo[k]) for i, k in enumerate(keys)]
    chunks = [rows[i:i + CHUNK] for i in range(0, len(rows), CHUNK)]
    out: dict[str, dict] = {}
    print(f"pass {pass_no}: {len(rows)} addresses in {len(chunks)} chunks", file=sys.stderr)
    with ThreadPoolExecutor(WORKERS) as ex:
        for n, result in enumerate(ex.map(_post, chunks), 1):
            for r in result:
                if not r or r[0] not in ids:
                    continue
                key = ids[r[0]]
                status = r[2] if len(r) > 2 else "No_Match"
                rec = {"key": key, "status": status, "quality": "", "matched": "",
                       "lat": "", "lng": "", "pass": pass_no}
                if status == "Match" and len(r) >= 6 and "," in r[5]:
                    lng, lat = r[5].split(",")
                    rec.update(quality=r[3], matched=r[4], lat=f"{float(lat):.6f}", lng=f"{float(lng):.6f}")
                out[key] = rec
            print(f"  chunk {n}/{len(chunks)} done", file=sys.stderr)
    return out


NOMINATIM = "https://nominatim.openstreetmap.org/search"
UA = "spirits-territory-map/0.1 (Summit Software Solutions; one-time backfill)"


MI_VIEWBOX = (-90.5, 41.6, -82.1, 48.4)


def _nominatim(params: dict, box=MI_VIEWBOX) -> tuple[str, str] | None:
    """Bounded to `box` (west, south, east, north): unbounded, "Bedford, MI"
    landed in Mississippi and "Lake City, MI" in Missouri."""
    time.sleep(1.1)  # usage policy: max 1 request per second
    w, s, e, n = box
    r = requests.get(NOMINATIM, params={**params, "format": "jsonv2", "limit": 1,
                                        "countrycodes": "us", "viewbox": f"{w},{n},{e},{s}",
                                        "bounded": 1},
                     headers={"User-Agent": UA}, timeout=30)
    r.raise_for_status()
    hits = r.json()
    if not hits:
        return None
    return f"{float(hits[0]['lat']):.6f}", f"{float(hits[0]['lon']):.6f}"


def backfill(cache: dict[str, dict], cache_path: Path, keys=None) -> None:
    """Census misses: OSM by street address (pass 3), then ZIP center (pass 4)."""
    keys = cache.keys() if keys is None else keys
    misses = [k for k in keys if cache[k]["status"] != "Match"]
    zips: dict[str, tuple[str, str] | None] = {}
    print(f"backfill: {len(misses)} addresses", file=sys.stderr)
    for i, k in enumerate(misses, 1):
        parts = split_address(k)
        if not parts:
            continue
        street, city, state, zip5 = parts
        hit = _nominatim({"street": clean_street(street), "city": city, "state": state,
                          "postalcode": zip5})
        quality, pass_no = "OSM", 3
        if hit is None:
            if zip5 not in zips:
                # Adding state here returns no results; postalcode alone works.
                zips[zip5] = _nominatim({"postalcode": zip5})
            hit, quality, pass_no = zips[zip5], "ZIP", 4
        if hit:
            cache[k] = {"key": k, "status": "Match", "quality": quality, "matched": "",
                        "lat": hit[0], "lng": hit[1], "pass": pass_no}
        if i % 100 == 0:
            save_cache(cache_path, cache)
            print(f"  {i}/{len(misses)}", file=sys.stderr)
    save_cache(cache_path, cache)


def repair(cache: dict[str, dict], cache_path: Path, wanted: dict[str, str]) -> int:
    """Re-place OSM and ZIP-center pins that fall outside their listed county.

    `wanted` maps address key -> MLCC county. Queries are bounded to the
    county's box and accepted only inside the county polygon (pass 5 street,
    pass 6 ZIP center); otherwise the address is marked Rejected and gets no pin.
    Census matches are left alone.
    """
    from stm import counties

    polys = counties.load()
    todo = []
    for k, county in wanted.items():
        r = cache.get(k)
        g = polys.get(counties.norm_county(county))
        if not r or not g or r["status"] != "Match" or r["quality"] not in ("OSM", "ZIP"):
            continue
        if not counties.contains(g, float(r["lng"]), float(r["lat"])):
            todo.append((k, g))
    print(f"repair: {len(todo)} OSM/ZIP pins outside their county", file=sys.stderr)
    for k, g in todo:
        street, city, _state, zip5 = split_address(k)
        box = counties.bbox(g)
        rec = {"key": k, "status": "Rejected", "quality": "", "matched": "", "lat": "", "lng": "", "pass": 5}
        for params, quality, pass_no in (
            ({"street": clean_street(street), "city": city, "postalcode": zip5}, "OSM", 5),
            ({"postalcode": zip5}, "ZIP", 6),
        ):
            hit = _nominatim(params, box)
            if hit and counties.contains(g, float(hit[1]), float(hit[0])):
                rec = {"key": k, "status": "Match", "quality": quality, "matched": "",
                       "lat": hit[0], "lng": hit[1], "pass": pass_no}
                break
        cache[k] = rec
    save_cache(cache_path, cache)
    return len(todo)


def geocode(addresses: list[str], cache_path: Path) -> dict[str, dict]:
    cache = load_cache(cache_path)
    todo = {}
    for a in addresses:
        k = norm_key(a)
        if k in cache or k in todo:
            continue
        parts = split_address(a)
        if parts:
            todo[k] = parts
        else:
            cache[k] = {"key": k, "status": "Unparsed", "quality": "", "matched": "",
                        "lat": "", "lng": "", "pass": 0}
    if todo:
        cache.update(_run_pass(todo, 1))
        save_cache(cache_path, cache)
        retry = {}
        for k, parts in todo.items():
            if cache[k]["status"] != "Match":
                street = clean_street(parts[0])
                if street and street != parts[0].upper():
                    retry[k] = (street, *parts[1:])
        if retry:
            for k, rec in _run_pass(retry, 2).items():
                if rec["status"] == "Match":
                    cache[k] = rec
            save_cache(cache_path, cache)
        backfill(cache, cache_path, list(todo))
    return cache

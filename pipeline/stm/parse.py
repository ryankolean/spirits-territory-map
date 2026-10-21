"""Parse MLCC licensee spirit purchase workbooks into one record per license.

Two layouts exist:
- SDD: one row per license, a single annual dollar column.
- Class C / B-Hotel: one row per license per month, with Subtotal/Total rows
  and grouping columns (account, county, LGU) blank on continuation rows.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import openpyxl

LICENSE_RE = re.compile(r"^L-\d{9}$")

# Normalized header -> canonical field name.
HEADER_MAP = {
    "lara business id": "lara_id",
    "account name": "account",
    "dba": "dba",
    "number": "license",
    "license: number": "license",
    "type": "license_type",
    "license: type": "license_type",
    "license: status": "status",
    "county: county": "county",
    "county": "county",
    "current lgu: lgu name": "lgu",
    "current lgu": "lgu",
    "physical address": "address",
    "historical sales record: historical sales records name": "month",
    "sales amount": "amount",
    "sdd historical sales previous year": "annual",
}

# Fields that are only filled on the first row of a group in some layouts.
FILL_DOWN = ("account", "lara_id", "county", "lgu")


def _norm_header(h) -> str:
    return re.sub(r"\s+", " ", str(h or "").replace("↑", "")).strip().lower()


def _clean(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def clean_address(a: str | None) -> str | None:
    if not a:
        return None
    a = re.sub(r"<br\s*/?>", " ", a, flags=re.I)
    return re.sub(r"\s+", " ", a).strip()


@dataclass
class License:
    license: str
    klass: str  # SDD | C | B-Hotel
    lara_id: str | None = None
    account: str | None = None
    dba: str | None = None
    license_type: str | None = None
    status: str | None = None
    county: str | None = None
    lgu: str | None = None
    address: str | None = None
    dollars: float = 0.0
    months: dict[str, float] = field(default_factory=dict)
    # Distinct values seen across monthly rows, for drift checks.
    seen: dict[str, set] = field(default_factory=dict)


def _read_rows(path: Path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    cols = {}
    for i, h in enumerate(header):
        key = HEADER_MAP.get(_norm_header(h))
        if key and key not in cols:
            cols[key] = i
    return cols, rows


def parse_file(path: Path, klass: str) -> tuple[dict[str, License], dict]:
    """Return ({license_no: License}, stats)."""
    cols, rows = _read_rows(path)
    stats = {"file": path.name, "columns": sorted(cols), "data_rows": 0,
             "subtotal_rows": 0, "file_total": None, "skipped": 0}
    out: dict[str, License] = {}
    carry: dict[str, object] = {}

    for raw in rows:
        vals = [_clean(v) for v in raw]
        if not any(v is not None for v in vals):
            continue
        if any(v == "Total" for v in vals[:3]):
            stats["file_total"] = vals[cols["amount"]] if "amount" in cols else None
            continue
        if any(v == "Subtotal" for v in vals[:3]):
            stats["subtotal_rows"] += 1
            continue

        rec = {k: vals[i] if i < len(vals) else None for k, i in cols.items()}
        for k in FILL_DOWN:
            if k in cols:
                if rec[k] is not None:
                    carry[k] = rec[k]
                else:
                    rec[k] = carry.get(k)

        lic = rec.get("license")
        if not lic or not LICENSE_RE.match(str(lic)):
            stats["skipped"] += 1
            continue
        stats["data_rows"] += 1

        L = out.get(lic)
        if L is None:
            L = out[lic] = License(license=lic, klass=klass)
        for k in ("lara_id", "account", "dba", "license_type", "status", "county", "lgu"):
            v = rec.get(k)
            if v is not None:
                v = str(v)
                L.seen.setdefault(k, set()).add(v)
                if getattr(L, k) is None:
                    setattr(L, k, v)
        addr = clean_address(rec.get("address"))
        if addr:
            L.seen.setdefault("address", set()).add(addr)
            if L.address is None:
                L.address = addr

        if "annual" in cols:
            L.dollars += float(rec.get("annual") or 0)
        else:
            amt = float(rec.get("amount") or 0)
            month = rec.get("month")
            L.months[month] = L.months.get(month, 0.0) + amt
            L.dollars += amt

    stats["licenses"] = len(out)
    stats["sum"] = round(sum(L.dollars for L in out.values()), 2)
    return out, stats


FILES_2025 = {
    "SDD": ("2025-All-SDD-Purchases-Alphabetical-by-Licensee-Name.xlsx",
            "2025-All-SDD-Purchases-by-County--LGU.xlsx"),
    "C": ("2025-Class-C-Purchases-by-Alphabetical-by-Licensee.xlsx",
          "2025-Class-C-Purchases-by-County--LGU.xlsx"),
    "B-Hotel": ("2025-B-Hotel-Purchases-Alphabetical-by-Licensee.xlsx",
                "2025-BHotel-Purchases-by-County--LGU.xlsx"),
}

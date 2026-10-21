"""Parse the 2021-2024 MLCC "ALL SALES BY DESCENDING SALES" PDF reports.

Old license numbers look like 10-435184; the 2025 system renumbered them as
L-000435184, so the six-digit suffix is the join key. Each report ends with an
ADJ $ SALES footer that the parsed rows must reconcile to.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

# Some rows carry only the license and amount (no business ID, city or name).
ROW = re.compile(
    r"^\s+(\d{2})-(\d{6})\s+(?:(\d+)\s+(.+?)\s{2,}(.+?)\s{2,})?([\d,]*\.\d{2})(-?)\s*$"
)
ADJ = re.compile(r"ADJ \$ SALES\s+=\s+([\d,]+\.\d{2})(-?)")

ALL_SALES_PDF = {
    2021: "2021/all2021.pdf",
    2022: "2022/allsales2022.pdf",
    2023: "2023/all2023.pdf",
    2024: "2024/CL36735-ALL-SALES-IN-DESCENDING-SALES.pdf",
}


def _num(s: str, neg: str) -> float:
    v = float(s.replace(",", ""))
    return -v if neg else v


# Old license prefix -> class, measured by joining 2021-2024 rows to 2025
# licenses. The suffix alone is not unique: 01-014207 and 10-014207 can both
# exist, so history is keyed by (license, class). Other prefixes (clubs,
# military, hospitals, ...) have no 2025 purchase file and are skipped.
PREFIX_CLASS = {"01": "C", "05": "C", "02": "B-Hotel", "06": "B-Hotel", "10": "SDD", "15": "SDD"}


def parse_pdf(path: Path) -> tuple[dict[tuple[str, str], float], dict]:
    """Return ({('L-000435184', 'SDD'): dollars}, stats). Reconciles on every row."""
    text = subprocess.run(
        ["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True, check=True
    ).stdout
    out: dict[tuple[str, str], float] = {}
    rows = 0
    total = 0.0
    adj = None
    for line in text.splitlines():
        m = ROW.match(line)
        if m:
            rows += 1
            amount = _num(m.group(6), m.group(7))
            total += amount
            klass = PREFIX_CLASS.get(m.group(1))
            if klass:
                key = (f"L-000{m.group(2)}", klass)
                out[key] = out.get(key, 0.0) + amount
            continue
        a = ADJ.search(line)
        if a:
            adj = _num(a.group(1), a.group(2))
    total = round(total, 2)
    stats = {"file": path.name, "rows": rows, "retail_rows": len(out),
             "sum": total, "adj_sales": adj,
             # 2024 is $20.53 short of its footer with every amount line parsed.
             "reconciled": adj is not None and abs(total - adj) < 100.0}
    return out, stats

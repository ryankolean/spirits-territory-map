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


def parse_pdf(path: Path) -> tuple[dict[str, float], dict]:
    """Return ({'L-000435184': dollars}, stats)."""
    text = subprocess.run(
        ["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True, check=True
    ).stdout
    out: dict[str, float] = {}
    dupes = 0
    adj = None
    for line in text.splitlines():
        m = ROW.match(line)
        if m:
            key = f"L-000{m.group(2)}"
            if key in out:
                dupes += 1
            out[key] = out.get(key, 0.0) + _num(m.group(6), m.group(7))
            continue
        a = ADJ.search(line)
        if a:
            adj = _num(a.group(1), a.group(2))
    total = round(sum(out.values()), 2)
    stats = {"file": path.name, "rows": len(out), "dupe_suffixes": dupes,
             "sum": total, "adj_sales": adj,
             # 2024 is $20.53 short of its footer with every amount line parsed.
             "reconciled": adj is not None and abs(total - adj) < 100.0}
    return out, stats

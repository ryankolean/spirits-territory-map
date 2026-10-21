"""Integrity checks on the 2025 purchase files and the license-list join.

Run: uv run python -m stm.validate ../data/raw
Prints a markdown report to stdout.
"""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

import openpyxl

from stm.parse import FILES_2025, LICENSE_RE, parse_file


def strip0(x):
    return x.lstrip("0") if x else x


def main(raw: Path) -> None:
    year_dir = raw / "2025"
    p = print
    p("# 2025 purchase file integrity\n")

    merged = {}
    for klass, (alpha_name, county_name) in FILES_2025.items():
        alpha, sa = parse_file(year_dir / alpha_name, klass)
        county, sc = parse_file(year_dir / county_name, klass)
        p(f"## {klass}\n")
        for s in (sa, sc):
            tot = s["file_total"]
            tot_ok = "n/a" if tot is None else ("match" if abs(tot - s["sum"]) < 0.01 else f"MISMATCH ({tot})")
            p(f"- `{s['file']}`: {s['data_rows']:,} data rows, {s['subtotal_rows']:,} subtotal rows, "
              f"{s['skipped']} skipped, {s['licenses']:,} licenses, sum ${s['sum']:,.2f}, file Total row: {tot_ok}")
            p(f"  - columns: {', '.join(s['columns'])}")
        a_keys, c_keys = set(alpha), set(county)
        p(f"- alpha-only licenses: {len(a_keys - c_keys)}; county-only: {len(c_keys - a_keys)}")
        diffs = [k for k in a_keys & c_keys if abs(alpha[k].dollars - county[k].dollars) > 0.01]
        p(f"- licenses whose dollars differ alpha vs county: {len(diffs)}")
        for k in sorted(a_keys - c_keys)[:5]:
            L = alpha[k]
            p(f"  - alpha-only {k} {L.account} / {L.dba} ${L.dollars:,.2f} {L.county}")
        for k in sorted(c_keys - a_keys)[:5]:
            L = county[k]
            p(f"  - county-only {k} {L.account} / {L.dba} ${L.dollars:,.2f} {L.county}")
        for k in diffs[:5]:
            p(f"  - diff {k}: alpha ${alpha[k].dollars:,.2f} vs county ${county[k].dollars:,.2f}")

        # Use the union, preferring the alpha record.
        recs = {**county, **alpha}
        types = Counter(L.license_type for L in recs.values())
        status = Counter(L.status for L in recs.values())
        nmonths = Counter(len(L.months) for L in recs.values()) if klass != "SDD" else None
        zero = sum(1 for L in recs.values() if L.dollars <= 0)
        p(f"- license types: {dict(types)}")
        p(f"- status: {dict(status)}")
        if nmonths:
            p(f"- months per license: {dict(sorted(nmonths.items()))}")
        p(f"- zero-dollar licenses: {zero:,} of {len(recs):,}")
        drift = Counter()
        for L in recs.values():
            for k, vals in L.seen.items():
                if len(vals) > 1:
                    drift[k] += 1
        p(f"- licenses with values changing across rows: {dict(drift)}")
        no_addr = [L for L in recs.values() if not L.address]
        br = sum(1 for L in recs.values() if L.address and "<br" in (L.address or "").lower())
        non_mi = [L for L in recs.values() if L.address and ", MI " not in L.address.upper() + " "]
        p(f"- missing address: {len(no_addr)}; non-MI-looking address: {len(non_mi)}")
        for L in non_mi[:5]:
            p(f"  - {L.license} {L.address!r}")
        p()
        for k, L in recs.items():
            merged[(klass, k)] = L

    p("## Cross-file\n")
    by_lic = Counter(k for (_, k) in merged)
    dup = [k for k, n in by_lic.items() if n > 1]
    p(f"- total license records: {len(merged):,}; license numbers in more than one class: {len(dup)}")
    bad = [k for (_, k) in merged if not LICENSE_RE.match(k)]
    p(f"- license numbers not matching L-#########: {len(bad)}")
    lara = Counter(L.lara_id for L in merged.values())
    p(f"- distinct LARA business IDs: {len(lara):,}; IDs holding 2+ licenses: {sum(1 for n in lara.values() if n > 1):,}; missing ID: {lara.get(None, 0)}")
    addr = Counter((L.address or "").upper() for L in merged.values())
    p(f"- distinct addresses: {len(addr):,}; addresses shared by 2+ licenses: {sum(1 for a, n in addr.items() if a and n > 1):,}")
    lens = Counter(len(L.lara_id or "") for L in merged.values())
    p(f"- LARA ID lengths: {dict(sorted(lens.items()))}")
    tot = Counter()
    for (klass, _), L in merged.items():
        tot[klass] += L.dollars
    p(f"- dollars by class: " + ", ".join(f"{k} ${v:,.0f}" for k, v in tot.items()))
    p()

    p("## License list join\n")
    for name in ("Master-License-List.xlsx", "Social-District-Permit-List.xlsx"):
        wb = openpyxl.load_workbook(raw / name, read_only=True, data_only=True)
        ws = wb.worksheets[0]
        rows = list(ws.iter_rows(values_only=True))
        hdr_i = next(i for i, r in enumerate(rows) if r and "LARA Business ID" in r)
        hdr = rows[hdr_i]
        body = [r for r in rows[hdr_i + 1:] if any(v is not None for v in r)]
        idx = hdr.index("LARA Business ID")
        ids = {str(r[idx]).strip() for r in body if r[idx]}
        purchase_ids = {L.lara_id for L in merged.values() if L.lara_id}
        exact = len(ids & purchase_ids)
        loose = len({strip0(i) for i in ids} & {strip0(i) for i in purchase_ids})
        has_lic = any("number" in str(h or "").lower() and "license" in str(h or "").lower() for h in hdr)
        p(f"- `{name}`: sheet {ws.title!r}, banner {rows[0][0]!r}, {len(body):,} rows")
        p(f"  - columns: {', '.join(str(h) for h in hdr)}")
        p(f"  - has a license-number column: {has_lic}")
        p(f"  - LARA IDs matching purchase files: {exact:,} exact, {loose:,} ignoring leading zeros, of {len(ids):,}")
        p(f"  - Type values: {dict(Counter(r[hdr.index('Type (Deprecated)')] for r in body))}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))

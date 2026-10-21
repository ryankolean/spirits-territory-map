"""Download MLCC source files into data/raw with a manifest of URLs and dates.

Purchase data: every .xlsx/.pdf linked from each year's purchase-data page.
License lists: both workbooks on the licensing page (their links are swapped
on the site; stm.build picks the master list by its columns, not its name).
"""

from __future__ import annotations

import html
import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import urljoin

import requests

from stm.build import RAW, YEARS

BASE = "https://www.michigan.gov"
YEAR_PAGE = BASE + "/lara/bureau-list/lcc/financial-management-division-reports/{y}-licensee-spirit-purchase-data"
LICENSING = BASE + "/lara/bureau-list/lcc/licensing-list"
UA = {"User-Agent": "Mozilla/5.0 (spirits-territory-map pipeline)"}
LINK = re.compile(r'href="([^"]*Licensee-Spirits-Purchase-Data/[^"]+\.(?:xlsx|pdf)[^"]*)"', re.I)
LIST_LINK = re.compile(r'href="([^"]*/License-Lists/[^"]+\.xlsx[^"]*)"', re.I)


def links(page: str, pattern: re.Pattern) -> list[str]:
    text = requests.get(page, headers=UA, timeout=60).text
    return sorted({urljoin(BASE, html.unescape(m)) for m in pattern.findall(text)})


def fetch(url: str, dest: Path) -> dict:
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = requests.get(url, headers=UA, timeout=300)
    r.raise_for_status()
    dest.write_bytes(r.content)
    print(f"{len(r.content):>10,}  {dest.relative_to(RAW)}")
    return {"url": url, "bytes": len(r.content)}


def main() -> None:
    manifest = {"downloaded": date.today().isoformat(), "files": {}}
    for y in YEARS:
        for url in links(YEAR_PAGE.format(y=y), LINK):
            name = url.split("?")[0].rsplit("/", 1)[1]
            manifest["files"][f"{y}/{name}"] = fetch(url, RAW / str(y) / name)
    for url in links(LICENSING, LIST_LINK):
        name = url.split("?")[0].rsplit("/", 1)[1]
        manifest["files"][name] = fetch(url, RAW / name)
    (RAW / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()

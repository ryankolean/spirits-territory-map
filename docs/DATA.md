# Data: sources, layouts, join

Verified 2026-10-21 against files downloaded that day. `make validate` reproduces the 2025 checks.

## Sources

| File | Year | Format | Used for |
| --- | --- | --- | --- |
| 2025 SDD, Class C, B-Hotel purchases (6 workbooks: alphabetical + county/LGU) | 2025 | Excel | Latest-year dollars, address, county, LGU |
| `ALL SALES BY DESCENDING SALES` report (CL36735) | 2021-2024 | PDF only | Five-year series, YoY |
| `Social-District-Permit-List.xlsx` (actually the master license list, see below) | Oct 16, 2026 | Excel | License status, DBA |
| US Census batch geocoder, then OpenStreetMap Nominatim for misses | | API | Lat/lng |

## 2025 purchase workbooks

The alphabetical and county/LGU files hold identical license sets and identical dollars for all three classes, so the pipeline reads only the alphabetical file.

**SDD (off-premise):** one row per license. Columns: `LARA Business ID`, `Account Name`, `DBA`, `SDD Historical Sales Previous Year`, `Type`, `Number`, `County: County`, `Current LGU: LGU Name`, `Physical Address`. No status column. Despite its name, the dollar column is 2025: Total Wine Novi shows $11,719,860 here against $12,446,448 in the 2024 report.

**Class C and B-Hotel (on-premise):** one row per license per month (`Jan 25` to `Dec 25`), plus `Subtotal` rows per account and a `Total` row. Columns: `Account Name`, `LARA Business ID`, `DBA`, `License: Number`, `License: Type`, `License: Status`, `Historical Sales Record: Historical Sales Records Name` (the month), `Sales Amount`, `County`, `Current LGU`, `Physical Address`. Account name and business ID appear only on a group's first row and are filled down. B-Hotel has an unnamed blank third column and `<br>` inside some addresses. January through October list $0 months; November and December rows exist only when the month was nonzero, so a missing month means $0.

| Class | Licenses | 2025 dollars | Check |
| --- | --- | --- | --- |
| SDD | 5,709 | $1,518,294,979.57 | No total row in the file |
| Class C | 8,881 | $251,587,051.01 | Matches file Total to the cent |
| B-Hotel | 416 | $19,487,420.12 | Matches file Total to the cent |

Every row has a physical address, so the purchase files geocode on their own; the license list is needed only for current status and DBA.

## License lists: the links are swapped

On the [licensing page](https://www.michigan.gov/lara/bureau-list/lcc/licensing-list), "Listing of Active, Conditional, and Escrowed Licenses" serves `Master-License-List.xlsx`, which holds 1,111 Social District permits. The Social District link serves `Social-District-Permit-List.xlsx`, sheet "All Licenses (Big List...)", which is the master list: 35,939 rows, statuses Active 32,934 / Escrow 2,609 / Conditional 396. `stm.build` identifies it by its `Number` and `Status` columns.

Master list columns: `LARA Business ID`, `Account Name`, `DBA`, `County: County`, `Current LGU: LGU Name`, `Issuing LGU: LGU Name`, `Address`, `Phone`, `Group`, `Type (Deprecated)`, `Subtype`, `Statute`, `Status`, `Number`, `Statute: Ownership Transferable`, `Statute: Location Transferable`.

## Join

Key: license number **and** license type. Numbers look like `L-000453615` (not `10-123456` as the spec assumed), but they are not unique: 144 numbers appear twice in the master list, usually an SDD or Class C sharing its number with an SDM (beer and wine) license, sometimes held by a different business. Joining on the number alone matched 43 terminated licenses to someone else's active SDM and showed the wrong name; joining on number and type gives 100% business-ID agreement (see [VALIDATION.md](VALIDATION.md)).

| Class | In purchase file | Found in master list | Not found | Kept on the map |
| --- | --- | --- | --- | --- |
| SDD | 5,709 | 4,707 | 1,002 ($43.5M) | 4,408 |
| Class C | 8,881 | 7,810 | 1,071 ($6.9M) | 6,981 |
| B-Hotel | 416 | 361 | 55 ($0.5M) | 341 |

Misses are licenses no longer active: the master list carries only active, conditional and escrowed licenses, and the misses' own purchase-file status is mostly Terminated, Escrow or Cancelled. The map keeps licenses whose master status is Active or Conditional: 11,730 kept, 3,276 dropped ($73.3M of 2025 dollars). When a dropped license shares an address and class with a kept one, its 2025 dollars show on the card as "a previous license at this address", which covers mid-year ownership transfers.

## History, 2021-2024

These years exist only as PDFs of the old mainframe report: license (`10-435184`), business ID, city, name, dollars. The new system renumbered `NN-XXXXXX` as `L-000XXXXXX`. The prefix names the class (01 and 05 Class C, 02 and 06 B-Hotel, 10 and 15 SDD), so history joins on number and class; 92% of 2024 rows map to a 2025 license, and 99.7% of mapped rows keep their business ID. Parsed totals reconcile to each report's `ADJ $ SALES` footer:

| Year | Licenses | Dollars | Footer |
| --- | --- | --- | --- |
| 2021 | 14,029 | $1,937,169,145.58 | exact |
| 2022 | 14,120 | $1,898,717,183.58 | exact |
| 2023 | 14,265 | $1,888,238,980.87 | exact |
| 2024 | 14,446 | $1,895,123,976.92 | $20.53 short, every amount line parsed |

## Geocoding

The Census batch geocoder matched 12,940 of 14,086 distinct 2025 addresses (91.9%). Misses at kept licenses go to OpenStreetMap Nominatim, bounded to Michigan (street address, then ZIP-code center, 1 request per second); unbounded, "Bedford, MI" landed in Mississippi. Any OpenStreetMap or ZIP pin outside the county MLCC lists is re-queried inside that county's boundary, or rejected. Results are cached in `data/cache/geocode.csv`; county boundaries in `data/cache/mi-counties.geojson`.

| Pin placement (11,730 kept licenses) | Count | Share |
| --- | --- | --- |
| Census exact match | 8,471 | 72.2% |
| Census interpolated match | 2,287 | 19.5% |
| OpenStreetMap street match | 612 | 5.2% |
| ZIP-code center (card says so) | 330 | 2.8% |
| Not placed | 30 | 0.3% |

99.5% of pins fall inside the county MLCC lists; the rest sit on county-line roads.

Cross-check against the City of Detroit's geocoded [Liquor Licenses (Current)](https://data.detroitmi.gov/datasets/detroitmi::liquor-licenses-current) layer, matched on street address and ZIP: 630 Detroit addresses, median distance 112 ft, 90th percentile 241 ft, 99th percentile 650 ft, one over a quarter mile (0.27 mi).

## Tier cutoffs

Set at the 50th, 80th and 97th percentiles of nonzero 2025 dollars, per view, because one set of cutoffs leaves nearly every bar in the lowest tier:

| View | Tier cutoffs | Pin size cap (99th pct) |
| --- | --- | --- |
| Bars (Class C + B-Hotel) | $25k / $60k / $150k | $250k |
| Stores (SDD) | $200k / $500k / $1.5M | $2.0M |

The minimum-dollar filter uses fixed round options instead (bars $25k / $50k / $100k / $150k, stores $100k / $250k / $500k / $1M), so "off-premise over $250k" stays two taps.

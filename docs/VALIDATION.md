# Data validation

Generated 2026-10-21 by `make crosscheck` (`pipeline/stm/crosscheck.py`). Each section checks one match the pipeline makes.

## 1. Purchase files joined to the master license list

12,878 of 15,006 purchase-file licenses found in the master list by license number and type. For each joined pair, the other identifying fields should agree:

| Field compared | Agree | Share |
| --- | --- | --- |
| LARA business ID | 12,878 | 100.0% |
| County | 12,878 | 100.0% |
| ZIP code | 12,869 | 99.9% |
| Street address (normalized) | 11,217 | 87.1% |
| DBA (where both name one) | 12,858 | 99.8% |

Street addresses differ mostly in formatting the normalizer does not fold (suite numbers, "Hwy" vs "Highway"); ZIP agreement is the stronger signal. DBA differences are names updated after a rebrand or sale; the map shows the master list's DBA. Examples:

- `L-000434880` purchase file "VALUE CENTER MARKETPLACE", master "HOLIDAY MARKET MADISON HEIGHTS"
- `L-000222343` purchase file "VALUE CENTER MARKETPLACE", master "HOLIDAY MARKET CLINTON TOWNSHIP"
- `L-000478808` purchase file "MEIJER", master "MEIJER #685"
- `L-000411644` purchase file "BEACON & BRIDGE MARKET #25", master "BEACON & BRIDGE MARKET #3"
- `L-000435875` purchase file "TOWN & COUNTRY LIQUOR STORE", master "DI TOWN & COUNTRY"

## 2. 2021-2024 history mapped to 2025 licenses

Old report rows (`NN-XXXXXX`) map to `L-000XXXXXX` within the class the prefix names (01 and 05 Class C, 02 and 06 B-Hotel, 10 and 15 SDD). A correct mapping should keep the business ID (unless the license changed owners) and the city.

| Year | Report rows | Mapped to a 2025 license | Same business ID | Same city | Mapped dollars |
| --- | --- | --- | --- | --- | --- |
| 2021 | 14,029 | 10,812 (77.1%) | 99.9% | 99.6% | $1,766,373,984 |
| 2022 | 14,121 | 11,658 (82.6%) | 99.9% | 99.7% | $1,809,887,204 |
| 2023 | 14,265 | 12,669 (88.8%) | 99.8% | 99.6% | $1,858,038,214 |
| 2024 | 14,447 | 13,307 (92.1%) | 99.7% | 99.6% | $1,872,245,789 |

Rows that do not map are licenses that closed before 2025. City disagreements are mostly mailing city versus municipality ("Township" names, unincorporated places).

## 3. Pins inside the county MLCC lists

Each pin tested against Census TIGERweb county boundaries (83 Michigan counties).

| Geocode quality | Pins | Inside listed county | Share |
| --- | --- | --- | --- |
| Census exact | 8,471 | 8,424 | 99.4% |
| Census interpolated or OSM | 2,899 | 2,886 | 99.6% |
| ZIP-code center | 330 | 330 | 100.0% |
| All | 11,700 | 11,640 | 99.5% |

OpenStreetMap and ZIP-center pins outside their county are re-placed or rejected by the build (`geocode.repair`). The rest are Census matches on county-line roads (8 Mile, Dequindre) or in cities that straddle a county line (Holland, Milan), within feet of the line. Largest buyers first:

- `L-000408674` KAKOZ 2, LLC, 36950 Dequindre Rd, Sterling Heights, MI 48310-4255 (listed Macomb, quality 2, $1,071,238)
- `L-000109363` FAMILY FARE #123, 1185 Washington Ave, Holland, MI 49423-7729 (listed Ottawa, quality 2, $761,760)
- `L-000468598` MOBIL MADISON, 25031 Dequindre Rd, Madison Heights, MI 48071-4210 (listed Oakland, quality 2, $708,264)
- `L-000158779` MILAN CITY MARKET, 825 Dexter St, Milan, MI 48160-1150 (listed Washtenaw, quality 2, $601,247)
- `L-000019126` UNIVERSAL PARTY SHOPPE, 28619 Dequindre Rd, Madison Heights, MI 48071-3056 (listed Oakland, quality 2, $534,694)
- `L-000487123` HANDY SPOT LIQUOR, 15900 E 8 Mile Rd, Detroit, MI 48205-1464 (listed Wayne, quality 2, $521,930)
- `L-000467386` HAPPY ELMA INC., 14601-14605 W 8 Mile Rd, Detroit, MI 48235-1621 (listed Wayne, quality 1, $476,495)
- `L-000123238` LINCOLNSHIRE PARTY STORE, 1110 Lincoln Ave, Holland, MI 49423-5308 (listed Ottawa, quality 2, $443,197)

## 4. Detroit pins vs the City of Detroit's geocoded licenses

Matched on street address and ZIP: 520 locations. Distance from our pin to the city's point: median 113 ft, 90th percentile 242 ft, 99th percentile 650 ft; 1 over a quarter mile. [Source](https://data.detroitmi.gov/datasets/detroitmi::liquor-licenses-current)

## 5. Output integrity

| Check | Result |
| --- | --- |
| Locations in `locations.geojson` | 11,700 |
| Duplicate license numbers | 0 |
| Pins inside Michigan's bounding box | 11,700 of 11,700 |
| Latest year of the series equals the pin's dollars | 11,700 of 11,700 |
| 2025 dollars on the map | $1,712,952,197 |

# Annual data refresh

MLCC publishes one new year of per-license spirits purchases a few weeks to a few months after the year closes. This runbook adds that year to the map. The run always ends in a pull request for Ryan to review and merge. Never merge it yourself, and never push to `main`.

Tracking: Jira SUMMIT-446 (2026 data, published in 2027). Make a new ticket for each later year.

## When MLCC publishes

Embedded file dates from the copies in `data/raw`:

| Data year | Format | Built by MLCC | Notes |
| --- | --- | --- | --- |
| 2021 | PDF | Jan 25, 2022 | |
| 2022 | PDF | Jan 25, 2023 | |
| 2023 | PDF | Jan 22, 2024 | |
| 2024 | PDF | Jan 25-27, 2025 | Last report from the old mainframe |
| 2025 | Excel | Mar 6-11, 2026 | First year from the new licensing system. The page was first archived Apr 11, 2026 |

MLCC also re-posts past years without notice. On Aug 17, 2026, all eight 2021 and 2022 PDFs were re-uploaded as tagged PDFs exported from Word, so the server dates on those files changed. Their totals still reconcile to the printed footers, and every file on the site matched the Oct 21, 2026 download byte for byte. Treat any older year as able to change.

Check dates for the 2026 data are Jan 29, Mar 15, Apr 15 and May 17, 2027. Each one is an all-day calendar task titled `[spirits-territory-map] ...` that names SUMMIT-446.

## Step 0: is the year out?

```bash
Y=2026
curl -s -o /dev/null -w "%{http_code}\n" -A "Mozilla/5.0" \
  "https://www.michigan.gov/lara/bureau-list/lcc/financial-management-division-reports/$Y-licensee-spirit-purchase-data"
```

If the page is not 200, or it has no `.xlsx`/`.pdf` links under `Licensee-Spirits-Purchase-Data/`, the data is not out yet. Comment on the Jira ticket with the date checked and the next check date. Then mark that calendar task `[DONE]` with a `COMPLETED` block that says "not published yet". After the last check date, ask Ryan whether to keep checking.

If MLCC has also renamed or moved the earlier year pages, stop and ask Ryan. Do not guess.

## Step 1: keep what exists

Nothing already on the map may be lost.

1. `git status --short` must be clean. Branch from `origin/main`: `git checkout -b data/$Y-refresh origin/main`.
2. Snapshot the source files before downloading anything. `data/raw` is gitignored and holds the only copies of files MLCC could remove or replace: `cp -Rp data/raw data/raw-archive/$(date +%F)`. `data/raw-archive/` is gitignored too.
3. Commit the current map data as `data/snapshots/locations-<old purchaseYear>.geojson` and `data/snapshots/meta-<old purchaseYear>.json`. These are the baseline the checks in step 4 compare against.

## Step 2: download

Add the new year to `YEARS` in `pipeline/stm/build.py`, then run `make download`. It fetches every year page in `YEARS` and both license lists. If an older year page now returns nothing, the step 1 snapshot still holds its files; restore them from there.

**Revised past years.** Compare every re-downloaded file against its step 1 snapshot with `shasum`. A hash change by itself is not a revision; the 2021 and 2022 re-exports changed the bytes only. For each file whose hash changed:

1. Parse the old copy and the new copy, then compare per `(license, class)` value and the printed totals.
2. If the values match, it is a format-only re-post. Use the new file and say so in the PR.
3. If any value changed, MLCC revised the data. Do not overwrite anything. Build the map from the snapshot's values for that year. Write the differences (license, old value, new value, totals before and after) to `docs/REVISIONS-<year>.md`, and ask in the PR whether to adopt them. Adopting them is a separate commit, made only after Ryan approves.
4. If a new file no longer parses, or its totals don't reconcile, keep the snapshot copy and flag it in the PR.

Read every new file before writing code. Note the format (Excel or PDF), the sheets and the columns, the totals rows, the month columns, and how license numbers look. Compare all of it with `docs/DATA.md`.

## Step 3: make the pipeline take the new year

The pipeline was written with 2025 as the newest year. Today the latest year comes from `FILES_2025` in `parse.py` and the history from `ALL_SALES_PDF` in `history.py`. Generalize it so a later year is a data change, not a code rewrite:

- **The latest year:** parse it from its own files. The file names change every year, so match them by class and "Alphabetical" rather than hard-coding them.
- **Last year's Excel moves into history:** read 2025 from its Excel files with the same parser and keyed by `(license, class)`, not from a PDF. It has to reconcile to the totals in `docs/DATA.md`: SDD $1,518,294,979.57, Class C $251,587,051.01, B-Hotel $19,487,420.12. Its value for every license must equal that license's last entry in the step 1 snapshot (the `y` array), to the dollar.
- **2021-2024 stay as they are:** parse them from their PDFs. Their footers must still reconcile.
- **New formats:** if MLCC changed the layout or license numbering again, add a parser for it. Keep the join on license number and type (see AGENTS.md). Never fall back to number only.
- **Text in the app:** `meta.json` carries `purchaseYear` and `years`, and the UI reads both, so the copy updates on its own. Grep `src/` for hard-coded years. The `?? 2025` fallbacks in `About.tsx` can stay.
- **Tier cutoffs:** recompute the 50th/80th/97th percentiles. Update the tier table in `docs/DATA.md`. Keep the fixed minimum-filter options unless the new data makes one of them empty.
- **Download the license list again:** licenses closed since October 2026 drop off the map. That is correct for a rep, and the license's history stays in the snapshot.
- **Geocoding:** new addresses go through the same Census, then bounded OpenStreetMap, path. Nominatim is limited to 1 request per second, so a large batch takes a while. The cache in `data/cache/geocode.csv` is append-only.

## Step 4: checks (all must pass)

1. `make build`, then `make crosscheck`. Read the new `docs/VALIDATION.md`. Business-ID agreement on the join must stay at 100%.
2. **No-loss check** against the step 1 snapshot. Write it as a script in `pipeline/stm/` so later years reuse it:
   - every license in the new file that was also in the snapshot has the same values for every year the snapshot had;
   - any mismatch has to be explained by a revision written up in `docs/REVISIONS-<year>.md`, and none is adopted without Ryan's approval;
   - the `years` array only grows: every old year is still present, in order;
   - every license in the snapshot but not in the new file is listed with its reason (closed, dropped from the master list, or not placed), and the PR includes the counts.
3. New year totals per class reconcile to MLCC's own total rows, or to the sum of rows where MLCC gives none. Record them in `docs/DATA.md`.
4. `npm run build` and `npx playwright test` (desktop, phone and phone-gpu). Update tests whose labels or values changed because of the new year; never delete a test to make the suite pass.
5. Render the app at 375, 768 and 1280 (Playwright, since MapLibre does not draw in the hidden browser pane). Check that the card trend now shows six years, that "vs <prior year>" reads correctly, and that the legend and About panel show the new year.

## Step 5: pull request

- Commits: `feat: add <year> MLCC purchase data`, plus separate `refactor:` commits for the pipeline changes and `docs:` commits.
- The PR body covers: what MLCC published (files and dates), totals per class, licenses added and dropped with reasons, the no-loss check output, test results, and screenshots.
- Comment the PR link on the Jira ticket and move the ticket to In Review. Mark the calendar task `[PR OPEN]`. Mark any later check-date tasks `[WONT-DO]` with "superseded, data published <date>".
- Update `docs/DATA.md` (sources, tables) and this file's publish-date table with the new year's real dates.
- Once the PR is merged, the Pages workflow runs the test suite and deploys. Then the ticket goes to Done.

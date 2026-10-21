# Spirits Territory Map

A static map of every licensed Michigan spirits retailer, sized by what it bought from the state (MLCC wholesale dollars), for liquor sales reps planning calls. Summit Software Solutions POC.

- Spec: Claude Doc "Spirits Territory Map — Spec"
- Brand: "Spirits Territory Map Brand" design system (tokens mirrored in `src/styles.css`)
- Data notes and column layouts: [docs/DATA.md](docs/DATA.md)
- Match validation: [docs/VALIDATION.md](docs/VALIDATION.md)

## Features

The six MVP features from the spec, each covered by `tests/poc.spec.ts`:

| Feature | What it does |
| --- | --- |
| Map | One pin per active license, sized and colored by 2025 dollars; clusters with summed dollars at zoom 8 and below |
| Near me | Locate button, 5 / 10 / 25 mile ring; the radius filters map and list |
| Filters | Bars (Class C, B-Hotel) or stores (SDD), plus minimum-dollar chips |
| Location card | Name, licensee, address, license, dollars, year-over-year change, five-year trend, rank; directions and share links |
| Ranked list | Locations in the radius (or the map view) by dollars; a row opens its pin |
| Search | Business (DBA or licensee) or city, prefix match; jumps the map |

Also: an About panel with the data caveats, shareable `#l=<license>` links, offline fallback via a service worker, installable as a phone app.

## Run

```bash
npm install
make build    # parse, join, geocode (cached), write public/data
npm run dev
```

`make refresh` re-downloads the MLCC files, rebuilds and re-validates. `make crosscheck` rewrites `docs/VALIDATION.md`. The pipeline needs `uv` and `pdftotext` (poppler).

## Test

```bash
npx playwright test                       # builds, serves on :4173, runs desktop + phone + GPU perf
BASE_URL=https://ryankolean.github.io/spirits-territory-map/ npx playwright test   # against the live site
```

Expected values come from `locations.geojson`, not from the app. The frame-rate test runs on the machine's GPU and skips itself where there is none (CI). Every push to `main` runs the suite, then deploys to GitHub Pages.

## Layout

| Path | What |
| --- | --- |
| `pipeline/stm/` | Python pipeline: `download`, `parse` (2025 Excel), `history` (2021-2024 PDFs), `geocode`, `counties`, `build`, `crosscheck`, `validate` |
| `data/raw/` | Source files (gitignored; `make download`) |
| `data/cache/` | Geocode cache and county boundaries; commit them so rebuilds cost nothing |
| `public/data/` | `locations.geojson` and `meta.json`, loaded by the app |
| `src/` | Vite + React + MapLibre front end |
| `tests/` | Playwright acceptance tests |

No backend, no API keys. Basemap tiles come from OpenFreeMap.

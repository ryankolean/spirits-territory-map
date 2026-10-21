# Spirits Territory Map

A static map of every licensed Michigan spirits retailer, sized by what it bought from the state (MLCC wholesale dollars), for liquor sales reps planning calls. Summit Software Solutions POC.

- Spec: Claude Doc "Spirits Territory Map — Spec"
- Brand: "Spirits Territory Map Brand" design system (tokens mirrored in `src/styles.css`)
- Data notes, column layouts and join checks: [docs/DATA.md](docs/DATA.md)

## Run

```bash
npm install
make build    # parse, join, geocode (cached), write public/data
npm run dev
```

`make refresh` re-downloads the MLCC files first. `make validate` prints the integrity report. The pipeline needs `uv` and `pdftotext` (poppler).

## Layout

| Path | What |
| --- | --- |
| `pipeline/stm/` | Python pipeline: `download`, `parse` (2025 Excel), `history` (2021-2024 PDFs), `geocode`, `build`, `validate` |
| `data/raw/` | Source files (gitignored; `make download`) |
| `data/cache/geocode.csv` | Geocode cache keyed by normalized address; commit it so rebuilds cost nothing |
| `public/data/` | `locations.geojson` and `meta.json`, loaded by the app |
| `src/` | Vite + React + MapLibre front end |

No backend, no API keys. Basemap tiles come from OpenFreeMap.

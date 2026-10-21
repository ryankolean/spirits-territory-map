# Agent Instructions

## Stack
- Front end: Vite 6, React 18, TypeScript, MapLibre GL 5, OpenFreeMap tiles. Static output in `dist/`.
- Pipeline: Python 3.12 via `uv` in `pipeline/`, `openpyxl` + `requests`, `pdftotext` for 2021-2024 PDFs.

## Commands
- `npm run dev` (dev server), `npm run build` (typecheck + build)
- `make build` (rebuild `public/data`), `make refresh` (download + build), `make validate`

## Rules
- MLCC's licensing page has the Master License List and Social District links swapped. `stm.build.load_master` picks the master list by its `Number` + `Status` columns; never by filename.
- Join key is the license number `L-#########`. 2021-2024 PDFs use `NN-XXXXXX`; map with `L-000` + the six-digit suffix.
- Figures are wholesale spirits purchases from MLCC. Say "purchases", never "sales" or "revenue", in UI copy.
- Never let a scrollable element overlap the map canvas: an `overflow: auto` sheet over the WebGL canvas blanked it in Chrome. The sheet docks below (mobile) or beside (desktop) the map.
- Do not pass `padding` to `easeTo`; it persists and stacks onto later `fitBounds`. Use `focus()` in `MapView.tsx`.
- Brand tokens come from the "Spirits Territory Map Brand" design system; square corners, no emojis.
- Verification: `npx playwright test` (six-feature acceptance suite). `window.__map` is exposed in dev builds and with `?e2e`; wait on `areTilesLoaded()`.
- Join the master list on license number AND type; numbers repeat across types (SDD or Class C sharing with an SDM). Run `make crosscheck` after any pipeline change and read `docs/VALIDATION.md`.
- Never measure map frame rate in default headless Chrome (software WebGL); the `phone-gpu` project uses the real GPU.

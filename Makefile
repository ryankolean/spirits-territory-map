PY = cd pipeline && uv run python

.PHONY: refresh download build validate dev

# Full pipeline: fetch MLCC files, then rebuild public/data.
refresh: download build

download:
	$(PY) -m stm.download

# Parse, join, geocode (cached in data/cache/geocode.csv) and write public/data.
build:
	$(PY) -m stm.build

# Integrity report on the 2025 purchase files and the license-list join.
validate:
	$(PY) -m stm.validate ../data/raw

dev:
	npm run dev

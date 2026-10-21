import { useEffect, useMemo, useRef, useState } from "react";
import { About } from "./components/About";
import { Legend } from "./components/Legend";
import { LocateIcon } from "./components/Icons";
import { LocationCard } from "./components/LocationCard";
import { RankedList } from "./components/RankedList";
import { SearchBar } from "./components/SearchBar";
import { loadData, VIEW_CLASSES, VIEW_LABEL, type Location, type Locations, type Meta, type View } from "./lib/data";
import { milesBetween, type LngLat } from "./lib/geo";
import { shortDollars, titleCase } from "./lib/format";
import { buildIndex, type SearchResult } from "./lib/search";
import { MapView, type Bounds, type FocusRequest, type Padding } from "./map/MapView";

const RADII = [5, 10, 25] as const;
/** Minimum-dollar filter options. Fixed round numbers, unlike the data-driven tier cutoffs. */
const MIN_OPTIONS: Record<View, number[]> = {
  bars: [25_000, 50_000, 100_000, 150_000],
  stores: [100_000, 250_000, 500_000, 1_000_000],
};
const DESKTOP = "(min-width: 992px)";

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

const inBounds = (f: Location, [w, s, e, n]: Bounds) => {
  const [x, y] = f.geometry.coordinates;
  return x >= w && x <= e && y >= s && y <= n;
};

export function App() {
  const [data, setData] = useState<{ locations: Locations; meta: Meta } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("bars");
  /** Minimum latest-year dollars; 0 = any. */
  const [minDollars, setMinDollars] = useState(0);
  const [me, setMe] = useState<LngLat | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const dark = useMedia("(prefers-color-scheme: dark)");
  const desktop = useMedia(DESKTOP);

  const controls = useRef<HTMLDivElement>(null);
  const [controlsH, setControlsH] = useState(104);

  useEffect(() => {
    loadData().then(setData, (e) => setError(String(e)));
  }, []);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (controls.current) setControlsH(controls.current.offsetHeight);
    });
    if (controls.current) ro.observe(controls.current);
    return () => ro.disconnect();
  }, []);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setNotice("Location is not available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setNotice(null);
        setMe([pos.coords.longitude, pos.coords.latitude]);
        setRadius((r) => r ?? 10);
        setRecenter((n) => n + 1);
      },
      () => {
        setLocating(false);
        setNotice("Location was not shared. Showing Detroit.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  // Center on the rep at first load only when location is already granted.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((s) => s.state === "granted" && locate())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = useMemo(() => (data ? buildIndex(data.locations.features) : null), [data]);

  const inView = useMemo(() => {
    if (!data) return [];
    const classes = VIEW_CLASSES[view];
    // "Any" keeps every license, including the few with net-negative dollars (refunds).
    return data.locations.features.filter(
      (f) => classes.includes(f.properties.c) && (minDollars === 0 || f.properties.d >= minDollars),
    );
  }, [data, view, minDollars]);

  const distance = useMemo(() => {
    if (!data || !me) return null;
    const out = new Map<string, number>();
    for (const f of data.locations.features) {
      out.set(f.properties.id, milesBetween(me, f.geometry.coordinates as LngLat));
    }
    return out;
  }, [data, me]);

  const radiusOn = !!(radius && distance);
  const visible = useMemo(
    () => (radiusOn ? inView.filter((f) => distance!.get(f.properties.id)! <= radius!) : inView),
    [inView, distance, radius, radiusOn],
  );
  const visibleFC = useMemo<Locations>(() => ({ type: "FeatureCollection", features: visible }), [visible]);

  // The list follows the radius when one is set, otherwise the map viewport.
  const ranked = useMemo(() => {
    const pool = radiusOn || !bounds ? visible : visible.filter((f) => inBounds(f, bounds));
    return [...pool].sort((a, b) => b.properties.d - a.properties.d);
  }, [visible, bounds, radiusOn]);

  const selected = useMemo(
    () => (selectedId ? visible.find((f) => f.properties.id === selectedId) ?? null : null),
    [visible, selectedId],
  );
  // A filter change can hide the selected pin; drop the card with it.
  useEffect(() => {
    if (selectedId && data && !selected) setSelectedId(null);
  }, [selected, selectedId, data]);

  const rank = useMemo(() => {
    if (!selected) return null;
    const pool = radiusOn ? visible : inView.filter((f) => f.properties.co === selected.properties.co);
    const sorted = [...pool].sort((a, b) => b.properties.d - a.properties.d);
    return {
      rank: sorted.findIndex((f) => f.properties.id === selected.properties.id) + 1,
      of: sorted.length,
      scope: radiusOn ? `within ${radius} mi` : `in ${titleCase(selected.properties.co)} County`,
    };
  }, [selected, visible, inView, radius, radiusOn]);

  const changeView = (v: View) => {
    setView(v);
    setMinDollars(0);
  };

  /** Show one location: switch filters as needed so its pin is on the map. */
  const goTo = (f: Location, zoom = 14) => {
    const p = f.properties;
    const target = (Object.keys(VIEW_CLASSES) as View[]).find((v) => VIEW_CLASSES[v].includes(p.c))!;
    if (target !== view) changeView(target);
    else if (p.d < minDollars) setMinDollars(0);
    if (radiusOn && distance!.get(p.id)! > radius!) setRadius(null);
    setSelectedId(p.id);
    setFocusRequest({ kind: "point", at: f.geometry.coordinates as LngLat, zoom, nonce: Date.now() });
  };

  const pickSearch = (r: SearchResult) => {
    if (r.kind === "location") return goTo(r.location);
    const pts = data!.locations.features.filter((f) => r.city && f.properties.a.toLowerCase().includes(`, ${r.city.toLowerCase()},`));
    if (!pts.length) return;
    const xs = pts.map((f) => f.geometry.coordinates[0]);
    const ys = pts.map((f) => f.geometry.coordinates[1]);
    setRadius(null);
    setSelectedId(null);
    setListOpen(false); // give the map room on phones before fitting the city
    setFocusRequest({ kind: "bounds", bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], nonce: Date.now() });
  };

  // A row pans to its pin; zoom only far enough that pins are not clustered.
  // Shareable links: #l=<license number> opens that location's card.
  const linked = useRef(false);
  useEffect(() => {
    if (!data || linked.current) return;
    linked.current = true;
    const id = new URLSearchParams(location.hash.slice(1)).get("l");
    const f = id && data.locations.features.find((x) => x.properties.id === id);
    if (f) goTo(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  useEffect(() => {
    if (!data || !linked.current) return;
    const url = `${location.pathname}${location.search}${selectedId ? `#l=${selectedId}` : ""}`;
    history.replaceState(null, "", url);
  }, [selectedId, data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !aboutOpen) setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aboutOpen]);

  const pickRow = (id: string) => {
    const f = visible.find((x) => x.properties.id === id);
    if (f) goTo(f, 9);
  };

  // The sheet sits beside or below the map, never over it; only the floating
  // controls cover the map.
  const padding: Padding = { top: 24, right: 24, bottom: controlsH + (desktop ? 32 : 24), left: 24 };

  const [one, many] = VIEW_LABEL[view].noun;
  const count = ranked.length;
  const scope = radiusOn ? `within ${radius} mi` : "in view";
  const showList = desktop || listOpen;

  return (
    <div className={`app${selected ? " has-card" : ""}`}>
      <header className="header">
        <h1>Spirits Territory Map</h1>
        <SearchBar search={search} onPick={pickSearch} />
        <button className="header-about label-sm" onClick={() => setAboutOpen(true)}>
          About
        </button>
      </header>
      <About open={aboutOpen} meta={data?.meta ?? null} onClose={() => setAboutOpen(false)} />
      <main className="stage">
        <div className="map-wrap">
          {data && (
            <MapView
              locations={visibleFC}
              onBounds={setBounds}
              focusRequest={focusRequest}
              tiers={data.meta.tiers[view]}
              selectedId={selectedId}
              onSelect={setSelectedId}
              me={me}
              radiusMiles={radius}
              recenter={recenter}
              padding={padding}
              dark={dark}
            />
          )}
          {!data && (
            <div className="loading small muted">{error ? `Could not load data. ${error}` : "Loading locations"}</div>
          )}

          <div className="controls" ref={controls}>
            <div className="controls-row">
              {me && (
                <div className="chips" role="group" aria-label="Radius">
                  {RADII.map((r) => (
                    <button
                      key={r}
                      className="chip label-sm"
                      aria-pressed={radius === r}
                      onClick={() => setRadius(radius === r ? null : r)}
                    >
                      {r} mi
                    </button>
                  ))}
                </div>
              )}
              <button
                className="locate"
                onClick={locate}
                disabled={locating}
                aria-pressed={!!me}
                aria-label={me ? "Re-center on my location" : "Show locations near me"}
              >
                <LocateIcon />
              </button>
            </div>
            <div className="chips" role="group" aria-label="Location type">
              {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
                <button key={v} className="chip label-sm" aria-pressed={view === v} onClick={() => changeView(v)}>
                  {VIEW_LABEL[v].chip}
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="sheet" aria-label="Locations">
          <div className="summary">
            <p className="count" aria-live="polite">
              {data ? `${count.toLocaleString("en-US")} ${count === 1 ? one : many} ${scope}` : "Loading"}
            </p>
            {!desktop && data && !selected && (
              <button className="text-button label-sm" aria-expanded={listOpen} onClick={() => setListOpen((o) => !o)}>
                {listOpen ? "Hide list" : "List"}
              </button>
            )}
          </div>
          {data && (
            <div className="chips min-chips" role="group" aria-label={`Minimum ${data.meta.purchaseYear} purchases`}>
              {[0, ...MIN_OPTIONS[view]].map((c) => (
                <button
                  key={c}
                  className="chip label-sm"
                  aria-pressed={minDollars === c}
                  onClick={() => setMinDollars(minDollars === c ? 0 : c)}
                >
                  {c === 0 ? "Any" : `${shortDollars(c)}+`}
                </button>
              ))}
            </div>
          )}
          {data && <Legend meta={data.meta} view={view} />}
          {notice && <p className="notice small">{notice}</p>}
          {selected && data && rank ? (
            <LocationCard
              location={selected}
              meta={data.meta}
              rank={rank.rank}
              rankOf={rank.of}
              rankScope={rank.scope}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            data && showList && <RankedList ranked={ranked} onPick={pickRow} />
          )}
          {(desktop || listOpen || selected) && (
            <p className="disclaimer small muted">
              Wholesale spirits purchases from public MLCC records. Not affiliated with or endorsed by MLCC or LARA. No
              warranty of accuracy.
            </p>
          )}
        </aside>
      </main>
    </div>
  );
}

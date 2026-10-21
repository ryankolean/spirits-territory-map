import { useEffect, useRef } from "react";
import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapGeoJSONFeature,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Locations, ViewMeta } from "../lib/data";
import { circle, DETROIT, type LngLat } from "../lib/geo";

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const EMPTY: Locations = { type: "FeatureCollection", features: [] };

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** [west, south, east, north] */
export type Bounds = [number, number, number, number];

export type FocusRequest =
  | { kind: "point"; at: LngLat; zoom: number; nonce: number }
  | { kind: "bounds"; bounds: Bounds; nonce: number };

interface Props {
  locations: Locations;
  /** Viewport after each move, so the ranked list can follow the map. */
  onBounds: (b: Bounds) => void;
  /** Camera moves asked for from outside the map (search results). */
  focusRequest: FocusRequest | null;
  tiers: ViewMeta;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  me: LngLat | null;
  radiusMiles: number | null;
  /** Bumped to re-center on `me` even when it has not moved. */
  recenter: number;
  padding: Padding;
  dark: boolean;
}

/**
 * Center a point inside the padded (unobscured) part of the map.
 *
 * easeTo's `padding` persists on the map and is added to every later
 * fitBounds, and a large `offset` blanked the canvas on phones. fitBounds on a
 * tiny box does neither: it strips padding after computing the camera.
 */
function focus(m: maplibregl.Map, at: LngLat, padding: Padding, zoom: number, duration = 400) {
  const e = 0.0001;
  m.fitBounds(
    [
      [at[0] - e, at[1] - e],
      [at[0] + e, at[1] + e],
    ],
    { padding, maxZoom: zoom, duration },
  );
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function pinRadius(max: number, extra = 0): ExpressionSpecification {
  // Square-root scale up to the view's 99th percentile: 10px to 32px diameter
  // from zoom 12, smaller at metro zoom so a 10-mile radius stays legible.
  const byDollars = (lo: number, hi: number): ExpressionSpecification => [
    "interpolate", ["linear"], ["sqrt", ["max", 0, ["get", "d"]]], 0, lo + extra, Math.sqrt(max), hi + extra,
  ];
  return ["interpolate", ["linear"], ["zoom"], 9, byDollars(3, 10), 12, byDollars(5, 16)];
}

function pinColor(cutoffs: [number, number, number]): ExpressionSpecification {
  return [
    "step",
    ["get", "d"],
    token("--pin-tier-1"),
    cutoffs[0],
    token("--pin-tier-2"),
    cutoffs[1],
    token("--pin-tier-3"),
    cutoffs[2],
    token("--pin-tier-4"),
  ];
}

export function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  // Latest props, read by handlers that outlive a render (style reloads, clicks).
  const latest = useRef(props);
  latest.current = props;

  const applyPaint = () => {
    const m = map.current;
    if (!m?.getLayer("pins")) return;
    const { tiers } = latest.current;
    m.setPaintProperty("pins", "circle-radius", pinRadius(tiers.max));
    m.setPaintProperty("pins", "circle-color", pinColor(tiers.cutoffs));
    m.setPaintProperty("pin-shadow", "circle-radius", pinRadius(tiers.max));
    m.setPaintProperty("selected", "circle-radius", pinRadius(tiers.max, 6));
    m.setPaintProperty("clusters", "circle-radius", [
      "interpolate",
      ["linear"],
      ["sqrt", ["get", "sum"]],
      0,
      18,
      Math.sqrt(tiers.max * 60),
      32,
    ]);
  };

  const applyRing = () => {
    const m = map.current;
    const { me, radiusMiles } = latest.current;
    (m?.getSource("ring") as GeoJSONSource | undefined)?.setData(
      me && radiusMiles
        ? { type: "FeatureCollection", features: [circle(me, radiusMiles)] }
        : { type: "FeatureCollection", features: [] },
    );
    (m?.getSource("me") as GeoJSONSource | undefined)?.setData(
      me
        ? {
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: me } }],
          }
        : { type: "FeatureCollection", features: [] },
    );
  };

  const addLayers = () => {
    const m = map.current!;
    const p = latest.current;
    for (const layer of m.getStyle().layers) {
      // The pins are the points of interest; keep the basemap's POIs out of the way.
      if ("source-layer" in layer && layer["source-layer"] === "poi") {
        m.setLayerZoomRange(layer.id, 13, 24);
      }
    }
    m.addSource("locations", {
      type: "geojson",
      data: p.locations ?? EMPTY,
      // Spec said cluster below zoom 11, but a 10-mile radius fits at zoom
      // 9.5-10 and showed only clusters; individual pins from zoom 9 up.
      cluster: true,
      clusterMaxZoom: 8,
      clusterRadius: 40,
      clusterProperties: { sum: ["+", ["get", "d"]] },
    });
    m.addSource("ring", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addSource("me", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

    m.addLayer({
      id: "ring-fill",
      type: "fill",
      source: "ring",
      paint: { "fill-color": token("--copper"), "fill-opacity": 0.06 },
    });
    m.addLayer({
      id: "ring-line",
      type: "line",
      source: "ring",
      paint: { "line-color": token("--bronze"), "line-width": 1.5, "line-dasharray": [3, 2] },
    });
    m.addLayer({
      id: "clusters",
      type: "circle",
      source: "locations",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": token("--surface-oak"),
        "circle-stroke-color": token("--pin-stroke"),
        "circle-stroke-width": 2,
        "circle-radius": 18,
      },
    });
    m.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "locations",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 12,
        "text-letter-spacing": 0.1,
        "text-allow-overlap": true,
      },
      paint: { "text-color": token("--ink-on-oak") },
    });
    m.addLayer({
      id: "pin-shadow",
      type: "circle",
      source: "locations",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "rgba(0, 0, 0, 0.3)",
        "circle-blur": 0.6,
        "circle-translate": [0, 1],
        "circle-radius": 5,
      },
    });
    m.addLayer({
      id: "pins",
      type: "circle",
      source: "locations",
      filter: ["!", ["has", "point_count"]],
      layout: { "circle-sort-key": ["get", "d"] },
      paint: {
        "circle-stroke-color": token("--pin-stroke"),
        "circle-stroke-width": 2,
        "circle-radius": 5,
      },
    });
    m.addLayer({
      id: "selected",
      type: "circle",
      source: "locations",
      filter: ["==", ["get", "id"], p.selectedId ?? ""],
      paint: {
        "circle-color": "rgba(0, 0, 0, 0)",
        "circle-stroke-color": token("--copper"),
        "circle-stroke-width": 3,
        "circle-radius": 11,
      },
    });
    m.addLayer({
      id: "me",
      type: "circle",
      source: "me",
      paint: {
        "circle-color": token("--ink"),
        "circle-radius": 6,
        "circle-stroke-color": token("--pin-stroke"),
        "circle-stroke-width": 3,
      },
    });
    applyPaint();
    applyRing();
  };

  // Create the map once.
  useEffect(() => {
    const m = new maplibregl.Map({
      container: el.current!,
      style: props.dark ? STYLE.dark : STYLE.light,
      center: props.me ?? DETROIT,
      zoom: 10,
      minZoom: 5,
      maxBounds: [
        [-92.5, 40.5],
        [-81.0, 48.5],
      ],
      attributionControl: { compact: true },
    });
    map.current = m;
    // Handle for the acceptance tests (wait for idle, find pins); dev builds or ?e2e only.
    if (import.meta.env.DEV || new URLSearchParams(location.search).has("e2e")) {
      (window as unknown as { __map: maplibregl.Map }).__map = m;
    }
    m.on("style.load", addLayers);

    m.on("click", "clusters", async (e) => {
      const f = e.features?.[0] as MapGeoJSONFeature | undefined;
      if (!f) return;
      const src = m.getSource("locations") as GeoJSONSource;
      const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
      focus(m, (f.geometry as GeoJSON.Point).coordinates as LngLat, latest.current.padding, zoom, 500);
    });
    m.on("click", (e) => {
      const hit = m.queryRenderedFeatures(e.point, { layers: ["pins"] })[0];
      if (hit) latest.current.onSelect(hit.properties.id as string);
      else if (!m.queryRenderedFeatures(e.point, { layers: ["clusters"] }).length) {
        latest.current.onSelect(null);
      }
    });
    const reportBounds = () => {
      const b = m.getBounds();
      latest.current.onBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    };
    m.on("moveend", reportBounds);
    m.once("load", reportBounds);
    for (const layer of ["pins", "clusters"]) {
      m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
    }
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Basemap follows the system theme; layers are re-added on style.load.
  const firstTheme = useRef(true);
  useEffect(() => {
    if (firstTheme.current) {
      firstTheme.current = false;
      return;
    }
    map.current?.setStyle(props.dark ? STYLE.dark : STYLE.light);
  }, [props.dark]);

  useEffect(() => {
    (map.current?.getSource("locations") as GeoJSONSource | undefined)?.setData(props.locations);
  }, [props.locations]);

  useEffect(applyPaint, [props.tiers]);

  useEffect(() => {
    map.current?.getLayer("selected") &&
      map.current.setFilter("selected", ["==", ["get", "id"], props.selectedId ?? ""]);
  }, [props.selectedId]);

  // Ring, marker and framing follow the rep's position and radius.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    applyRing();
    const { me, radiusMiles, padding } = props;
    if (!me) return;
    if (radiusMiles) {
      const ring = circle(me, radiusMiles).geometry.coordinates[0] as LngLat[];
      const lngs = ring.map((c) => c[0]);
      const lats = ring.map((c) => c[1]);
      m.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: { ...padding, top: padding.top + 16, bottom: padding.bottom + 16 }, duration: 600 },
      );
    }
    // No radius: the ring goes, the camera stays. Locating always sets a
    // radius, and a cleared radius (chip deselected, or a search result
    // outside it) must not pull the map back to the rep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.me, props.radiusMiles, props.recenter]);

  // Keep the selected pin in the clear part of the map: on selection, and
  // again when the map shrinks because the sheet grew to hold the card.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const keepSelectedInView = () => {
      // Mid-animation (a search or link zooming in), re-check once it lands;
      // refitting now would freeze the zoom wherever the animation had reached.
      if (m.isMoving()) {
        m.once("moveend", keepSelectedInView);
        return;
      }
      const { selectedId, locations, padding: pad } = latest.current;
      const f = selectedId && locations.features.find((x) => x.properties.id === selectedId);
      if (!f) return;
      const pt = m.project(f.geometry.coordinates as LngLat);
      const { clientWidth: w, clientHeight: h } = m.getContainer();
      const visible = pt.x > pad.left && pt.x < w - pad.right && pt.y > pad.top && pt.y < h - pad.bottom;
      if (!visible) focus(m, f.geometry.coordinates as LngLat, pad, m.getZoom());
    };
    keepSelectedInView();
    m.on("resize", keepSelectedInView);
    return () => {
      m.off("resize", keepSelectedInView);
      m.off("moveend", keepSelectedInView);
    };
  }, [props.selectedId, props.padding.bottom]);

  useEffect(() => {
    const m = map.current;
    const req = props.focusRequest;
    if (!m || !req) return;
    // The same render may have resized the map (list closed); fit to the new size.
    m.resize();
    if (req.kind === "point") {
      focus(m, req.at, props.padding, Math.max(m.getZoom(), req.zoom), 800);
    } else {
      const [w, s, e, n] = req.bounds;
      m.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: props.padding, maxZoom: 14, duration: 800 },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusRequest]);

  return <div ref={el} className="map" />;
}

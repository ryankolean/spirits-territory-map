import type { Feature, FeatureCollection, Point } from "geojson";

/** S = SDD (off-premise), C = Class C (on-premise), H = B-Hotel. */
export type LicenseClass = "S" | "C" | "H";
export type View = "bars" | "stores";

export interface LocationProps {
  id: string;
  /** Display name: DBA from the master list, else the purchase-file DBA, else licensee. */
  n: string;
  /** Licensee (account) name. */
  o: string;
  c: LicenseClass;
  /** 1 when the SDD license is a Resort license. */
  r: 0 | 1;
  a: string;
  co: string;
  lg: string;
  /** Latest-year purchase dollars. */
  d: number;
  /** Dollars per year, aligned with Meta.years; null where the license has no record. */
  y: (number | null)[];
  /** Geocode quality: 2 exact Census match, 1 interpolated or OSM, 0 ZIP-code center. */
  q: 0 | 1 | 2;
  /** First month with a purchase record, when the license started mid-year. */
  since?: string;
  /** Latest-year dollars of terminated or escrowed licenses at this address. */
  pv?: number;
}

export type Location = Feature<Point, LocationProps>;
export type Locations = FeatureCollection<Point, LocationProps>;

export interface ViewMeta {
  cutoffs: [number, number, number];
  max: number;
  count: number;
}

export interface Meta {
  purchaseYear: number;
  years: number[];
  licenseListDate: string;
  built: string;
  tiers: Record<View, ViewMeta>;
}

export const VIEW_CLASSES: Record<View, LicenseClass[]> = {
  bars: ["C", "H"],
  stores: ["S"],
};

export const VIEW_LABEL: Record<View, { chip: string; noun: [string, string] }> = {
  bars: { chip: "Bars · On-premise", noun: ["bar", "bars"] },
  stores: { chip: "Stores · Off-premise", noun: ["store", "stores"] },
};

export const CLASS_LABEL: Record<LicenseClass, string> = {
  S: "SDD · Off-premise",
  C: "Class C · On-premise",
  H: "B-Hotel · On-premise",
};

export async function loadData(): Promise<{ locations: Locations; meta: Meta }> {
  const base = import.meta.env.BASE_URL;
  const [locations, meta] = await Promise.all([
    fetch(`${base}data/locations.geojson`).then((r) => {
      if (!r.ok) throw new Error(`locations.geojson: ${r.status}`);
      return r.json() as Promise<Locations>;
    }),
    fetch(`${base}data/meta.json`).then((r) => {
      if (!r.ok) throw new Error(`meta.json: ${r.status}`);
      return r.json() as Promise<Meta>;
    }),
  ]);
  return { locations, meta };
}

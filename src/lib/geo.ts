import type { Feature, Polygon } from "geojson";

export type LngLat = [number, number];

const EARTH_MI = 3958.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function milesBetween(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.sqrt(h));
}

/** A geodesic-enough circle polygon for drawing the radius ring. */
export function circle(center: LngLat, miles: number, steps = 96): Feature<Polygon> {
  const [lng, lat] = center;
  const dLat = miles / 69.0;
  const dLng = miles / (69.0 * Math.cos(rad(lat)));
  const ring: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

/** Detroit, the fallback center when location is not granted. */
export const DETROIT: LngLat = [-83.0458, 42.3314];

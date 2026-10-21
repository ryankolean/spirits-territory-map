import type { Location } from "./data";
import { titleCase } from "./format";

export type SearchResult =
  | { kind: "location"; location: Location; city: string }
  | { kind: "city"; city: string; count: number };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "123 Main St, Royal Oak, MI 48067" -> "Royal Oak" */
export function cityOf(address: string): string {
  const parts = address.split(",");
  return titleCase((parts.length >= 3 ? parts[parts.length - 2] : "").trim());
}

interface Entry {
  location: Location;
  city: string;
  words: string[];
}

/**
 * Prefix match on DBA, licensee and city: every query word must start some
 * word of the entry ("roy oak" finds "Royal Oak"). Ranked by dollars.
 */
export function buildIndex(locations: Location[]) {
  const entries: Entry[] = locations.map((location) => {
    const city = cityOf(location.properties.a);
    const p = location.properties;
    return { location, city, words: norm(`${p.n} ${p.o} ${city}`).split(" ") };
  });
  const cities = new Map<string, number>();
  for (const e of entries) if (e.city) cities.set(e.city, (cities.get(e.city) ?? 0) + 1);
  const cityWords = [...cities].map(([city, count]) => ({ city, count, words: norm(city).split(" ") }));

  const matches = (words: string[], tokens: string[]) =>
    tokens.every((t) => words.some((w) => w.startsWith(t)));

  return (query: string, limit = 8): SearchResult[] => {
    const tokens = norm(query).split(" ").filter(Boolean);
    if (!tokens.length) return [];
    const cityHits: SearchResult[] = cityWords
      .filter((c) => matches(c.words, tokens))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(({ city, count }) => ({ kind: "city", city, count }));
    const locHits: SearchResult[] = entries
      .filter((e) => matches(e.words, tokens))
      .sort((a, b) => b.location.properties.d - a.location.properties.d)
      .slice(0, limit - cityHits.length)
      .map((e) => ({ kind: "location", location: e.location, city: e.city }));
    return [...cityHits, ...locHits];
  };
}

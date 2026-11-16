import { useEffect, useState } from "react";
import type { Location } from "../lib/data";
import { dollars, percentChange, signedPercent } from "../lib/format";

export type Sort = "purchases" | "growth" | "nearest";

const miles = new Intl.NumberFormat(undefined, { style: "unit", unit: "mile", maximumFractionDigits: 1, minimumFractionDigits: 1 });
import { cityOf } from "../lib/search";
import { ArrowDownRight, ArrowUpRight, Dash } from "./Icons";

interface Props {
  ranked: Location[];
  /** Latest and prior purchase years, for the column header. */
  year: number;
  priorYear: number;
  /** Names the filter that emptied the list. */
  emptyText: string;
  onClear: () => void;
  sort: Sort;
  onSort: (s: Sort) => void;
  canSortNearest: boolean;
  /** Miles from the radius center, when there is one. */
  distance: Map<string, number> | null;
  onPick: (id: string) => void;
}

const PAGE = 50;

/** Locations in the radius or view, biggest buyer first. */
const SORT_LABEL: Record<Sort, string> = { purchases: "Purchases", growth: "Growth", nearest: "Nearest" };

export function RankedList({ ranked, year, priorYear, onPick, emptyText, onClear, sort, onSort, canSortNearest, distance }: Props) {
  const sorts: Sort[] = canSortNearest ? ["purchases", "growth", "nearest"] : ["purchases", "growth"];
  const order =
    sort === "nearest"
      ? "nearest first"
      : sort === "growth"
        ? `fastest growth vs ${priorYear} first`
        : `biggest ${year} purchases first`;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [ranked]);

  if (!ranked.length) {
    return (
      <div className="state">
        <p className="small list-empty">{emptyText}</p>
        <button className="more label-sm" onClick={onClear}>
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <>
      <div className="list-top">
        <div className="sort small" role="group" aria-label="Sort the list">
          <span className="muted">Sort</span>
          {sorts.map((s) => (
            <button key={s} className="sort-btn label-sm" aria-pressed={sort === s} onClick={() => onSort(s)}>
              {SORT_LABEL[s]}
              {sort === s && <span aria-hidden="true">{s === "nearest" ? " \u2191" : " \u2193"}</span>}
            </button>
          ))}
        </div>
        <div className="ranked-head small muted" aria-hidden="true">
          <span>#</span>
          <span>Location</span>
          <span className="num-head">
            {year} purchases, change vs {priorYear}
          </span>
        </div>
      </div>
      <ol className="ranked" aria-label={`Sorted ${order}. ${year} purchases; change vs ${priorYear}.`}>
        {ranked.slice(0, shown).map((f, i) => {
          const p = f.properties;
          const change = percentChange(p.d, p.y[p.y.length - 2]);
          const dir = change == null ? null : change >= 0.5 ? "up" : change <= -0.5 ? "down" : "flat"; // matches the whole-percent label
          return (
            <li key={p.id}>
              <button className="row" data-id={p.id} onClick={() => onPick(p.id)}>
                <span className="row-rank label-sm">{i + 1}</span>
                <span className="row-main">
                  <span className="row-name" title={p.n}>{p.n}</span>
                  <span className="small muted">
                    {cityOf(p.a)}
                    {sort === "nearest" && distance?.has(p.id) && `, ${miles.format(distance.get(p.id)!)}`}
                  </span>
                </span>
                <span className="row-figure">
                  <span className="row-num">{dollars(p.d)}</span>
                  {change == null ? (
                    <span className="delta flat">
                      <Dash />
                      No {priorYear}
                    </span>
                  ) : (
                    <span className={`delta ${dir}`}>
                      {dir === "up" ? <ArrowUpRight /> : dir === "down" ? <ArrowDownRight /> : <Dash />}
                      {signedPercent(change, 0)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {ranked.length > shown && (
        <button className="more label-sm" onClick={() => setShown((s) => s + PAGE)}>
          Show {Math.min(PAGE, ranked.length - shown)} more
        </button>
      )}
    </>
  );
}

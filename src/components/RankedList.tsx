import { useEffect, useState } from "react";
import type { Location } from "../lib/data";
import { dollars, percentChange } from "../lib/format";
import { cityOf } from "../lib/search";
import { ArrowDownRight, ArrowUpRight } from "./Icons";

interface Props {
  ranked: Location[];
  onPick: (id: string) => void;
}

const PAGE = 50;

/** Locations in the radius or view, biggest buyer first. */
export function RankedList({ ranked, onPick }: Props) {
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [ranked]);

  if (!ranked.length) {
    return <p className="small muted list-empty">No locations match. Widen the radius or lower the minimum.</p>;
  }
  return (
    <>
      <ol className="ranked">
        {ranked.slice(0, shown).map((f, i) => {
          const p = f.properties;
          const change = percentChange(p.d, p.y[p.y.length - 2]);
          return (
            <li key={p.id}>
              <button className="row" data-id={p.id} onClick={() => onPick(p.id)}>
                <span className="row-rank label-sm">{i + 1}</span>
                <span className="row-main">
                  <span className="row-name">{p.n}</span>
                  <span className="small muted">{cityOf(p.a)}</span>
                </span>
                <span className="row-figure">
                  <span className="row-num">{dollars(p.d)}</span>
                  {change != null && Math.abs(change) >= 0.05 && (
                    <span className={`delta ${change > 0 ? "up" : "down"}`}>
                      {change > 0 ? <ArrowUpRight /> : <ArrowDownRight />}
                      {Math.abs(change).toFixed(0)}%
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

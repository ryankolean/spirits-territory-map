import { useState } from "react";
import { CLASS_LABEL, type Location, type Meta } from "../lib/data";
import { dollars as full, percentChange, shortDollars, signedPercent, titleCase } from "../lib/format";
import { ArrowDownRight, ArrowUpRight, CloseIcon, Dash } from "./Icons";
import { Sparkline } from "./Sparkline";

const TREND_W = 280;

interface Props {
  location: Location;
  meta: Meta;
  rank: number;
  rankOf: number;
  rankScope: string;
  onClose: () => void;
}


export function LocationCard({ location, meta, rank, rankOf, rankScope, onClose }: Props) {
  const p = location.properties;
  const prior = p.y[p.y.length - 2];
  const change = percentChange(p.d, prior);
  const priorYear = meta.years[meta.years.length - 2];
  const showLicensee = p.o && p.o.toUpperCase() !== p.n.toUpperCase();
  const [shared, setShared] = useState(false);
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.a)}`;
  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#l=${p.id}`;
    try {
      if (navigator.share) await navigator.share({ title: p.n, text: `${p.n}, ${p.a}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setShared(true);
      }
    } catch {
      // Share sheet dismissed or clipboard blocked; nothing to report.
    }
  };

  // Trend takeaway: change from the first year with a record to the latest.
  const firstIdx = p.y.findIndex((v) => v != null && v > 0);
  const since = firstIdx >= 0 && firstIdx < p.y.length - 1 ? percentChange(p.d, p.y[firstIdx]) : null;
  const trendTitle =
    since == null
      ? `Purchases by year, ${meta.years[0]} to ${meta.purchaseYear}`
      : `${signedPercent(since, 0)} since ${meta.years[firstIdx]}`;

  let delta;
  if (change == null) {
    delta = (
      <span className="delta flat">
        <Dash /> {prior == null ? `No ${priorYear} record` : `${full(prior)} in ${priorYear}`}
      </span>
    );
  } else {
    const dir = change > 0.05 ? "up" : change < -0.05 ? "down" : "flat";
    delta = (
      <span className={`delta ${dir}`}>
        {dir === "up" ? <ArrowUpRight /> : dir === "down" ? <ArrowDownRight /> : <Dash />}
        {signedPercent(change, 1)} vs {priorYear}
      </span>
    );
  }

  return (
    <article className="card" aria-labelledby="card-name">
      <button className="close" onClick={onClose} aria-label="Close location">
        <CloseIcon />
      </button>
      <span className="eyebrow label-sm">
        {CLASS_LABEL[p.c]}
        {p.r ? ", resort" : ""}.
        <span className="nowrap"> License {p.id}</span>
      </span>
      <h2 id="card-name" className="name display-lg">
        {p.n}
      </h2>
      {showLicensee && <p className="licensee small muted">Licensee: {titleCase(p.o)}</p>}
      <address className="body">{p.a}</address>
      <hr />
      <div className="figure">
        <span className="number">{full(p.d)}</span>
        {delta}
      </div>
      <span className="rank label-sm">
        #{rank} of {rankOf} {rankScope}
      </span>
      <p className="small muted note">
        {meta.purchaseYear} spirits bought from the MLCC, wholesale dollars.
        {change != null && ` ${priorYear}: ${full(prior!)}.`}
      </p>
      {p.since && (
        <p className="small note">
          License on record from {p.since} {meta.purchaseYear}; partial year.
        </p>
      )}
      {p.pv != null && p.pv > 0 && (
        <p className="small note">
          A previous license at this address bought {full(p.pv)} in {meta.purchaseYear}.
        </p>
      )}
      <div className="trend">
        <h3 className="heading-wide-sm">{trendTitle}</h3>
        <Sparkline values={p.y} width={TREND_W} />
        {/* Direct labels under each point; also the chart's data alternative. */}
        <table className="trend-table small" style={{ width: TREND_W }}>
          <caption className="sr-only">Spirits purchases by year, wholesale dollars</caption>
          <thead>
            <tr>
              {meta.years.map((y) => (
                <th key={y} scope="col" className="muted">
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {p.y.map((v, i) => (
                <td key={meta.years[i]} title={v == null ? undefined : full(v)}>
                  {v == null ? "None" : shortDollars(v)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {p.q === 0 && (
        <p className="small muted note">Pin placed at the ZIP code center; the street address did not geocode.</p>
      )}
      <div className="card-links">
        <a className="label-sm" href={directions} target="_blank" rel="noreferrer">
          Directions
        </a>
        <button className="text-button label-sm" onClick={share}>
          {shared ? "Link copied" : "Share"}
        </button>
      </div>
    </article>
  );
}

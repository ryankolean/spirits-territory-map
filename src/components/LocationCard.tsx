import { useState } from "react";
import { CLASS_LABEL, type Location, type Meta } from "../lib/data";
import { percentChange, titleCase } from "../lib/format";
import { ArrowDownRight, ArrowUpRight, CloseIcon, Dash } from "./Icons";
import { Sparkline } from "./Sparkline";

interface Props {
  location: Location;
  meta: Meta;
  rank: number;
  rankOf: number;
  rankScope: string;
  onClose: () => void;
}

const full = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

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

  let delta;
  if (change == null) {
    delta = (
      <span className="delta flat">
        <Dash /> {prior == null ? `No ${priorYear} record` : `${full(0)} in ${priorYear}`}
      </span>
    );
  } else {
    const dir = change > 0.05 ? "up" : change < -0.05 ? "down" : "flat";
    delta = (
      <span className={`delta ${dir}`}>
        {dir === "up" ? <ArrowUpRight /> : dir === "down" ? <ArrowDownRight /> : <Dash />}
        {Math.abs(change).toFixed(1)}%
        <span className="sr-only"> vs {priorYear}</span>
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
        {p.r ? " · Resort" : ""} · <span className="nowrap">{p.id}</span>
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
        <h3 className="heading-wide-sm">Five-year trend</h3>
        <div className="trend-row">
          <div>
            <Sparkline values={p.y} />
            <div className="years small muted">
              {meta.years.map((y) => (
                <span key={y}>'{String(y).slice(2)}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <span className="rank label-sm">
        #{rank} of {rankOf} {rankScope}
      </span>
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

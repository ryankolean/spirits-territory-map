import type { Meta, View } from "../lib/data";
import { shortDollars } from "../lib/format";

interface Props {
  meta: Meta;
  view: View;
}

export function Legend({ meta, view }: Props) {
  const [a, b, c] = meta.tiers[view].cutoffs;
  const tiers = [
    { color: "--pin-tier-1", label: `Under ${shortDollars(a)}` },
    { color: "--pin-tier-2", label: `${shortDollars(a)}–${shortDollars(b)}` },
    { color: "--pin-tier-3", label: `${shortDollars(b)}–${shortDollars(c)}` },
    { color: "--pin-tier-4", label: `${shortDollars(c)}+` },
  ];
  return (
    <div className="legend small muted" aria-label="Pin size and color show yearly spirits purchases">
      {tiers.map((t) => (
        <span className="tier" key={t.color}>
          <span className="swatch" style={{ background: `var(${t.color})` }} />
          {t.label}
        </span>
      ))}
      <span>
        {meta.purchaseYear} purchases · licenses as of {meta.licenseListDate}
      </span>
    </div>
  );
}

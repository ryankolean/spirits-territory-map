// All display numbers go through Intl in the reader's locale. Figures are US dollars.
const usd = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCompact = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const int = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const pct = (digits: number) =>
  new Intl.NumberFormat(undefined, {
    style: "percent",
    signDisplay: "exceptZero",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
const pct0 = pct(0);
const pct1 = pct(1);

/** Exact whole dollars ("$487,210"); for columns and the card figure. */
export function dollars(n: number): string {
  return usd.format(Math.round(n));
}

/** Compact dollars for labels and filter chips ("$40K", "$1.2M"). */
export function shortDollars(n: number): string {
  return usdCompact.format(n);
}

/** Counts ("1,175"). */
export function count(n: number): string {
  return int.format(n);
}

/** Signed percent change from a value in percent units (12.3 -> "+12.3%"). */
export function signedPercent(change: number, digits: 0 | 1): string {
  return (digits ? pct1 : pct0).format(change / 100);
}

export function percentChange(now: number, prior: number | null | undefined): number | null {
  if (prior == null || prior <= 0) return null;
  return ((now - prior) / prior) * 100;
}

const KEEP_UPPER = /\b(Llc|L\.l\.c|Pllc|Llp|Lp|Ii|Iii|Iv|Usa|Vfw|Bpoe)\b/g;

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(KEEP_UPPER, (m) => m.toUpperCase());
}

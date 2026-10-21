/** Full dollars below $1M ("$487,210"), one decimal in millions above. */
export function dollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Compact cutoff labels for the legend ("$40k", "$1.2M"). */
export function shortDollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
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

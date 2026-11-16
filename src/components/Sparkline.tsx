interface Props {
  values: (number | null)[];
  width?: number;
  height?: number;
}

/** Five-year trend in copper; gaps where a year has no record, last point ringed.
 * Points sit at the centers of width/n columns so labels below can align to them.
 * The y axis starts at $0. */
export function Sparkline({ values, width = 150, height = 48 }: Props) {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  const max = Math.max(...present, 1);
  const pad = 4;
  const col = width / Math.max(values.length, 1);
  const x = (i: number) => col / 2 + i * col;
  const y = (v: number) => height - pad - (v / max) * (height - 2 * pad);

  const segments: string[] = [];
  let run: string[] = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (run.length > 1) segments.push(run.join(" "));
      run = [];
    } else run.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (run.length > 1) segments.push(run.join(" "));

  const lastIdx = values.length - 1;
  const last = values[lastIdx];

  return (
    <svg width={width} height={height} role="img" aria-label="Five-year purchase trend">
      {/* $0 baseline, so the space under the line reads as scale. */}
      <line x1={0} x2={width} y1={height - pad} y2={height - pad} stroke="var(--border)" strokeWidth={1} />
      {segments.map((pts, i) => (
        <polyline key={i} points={pts} fill="none" stroke="var(--copper)" strokeWidth={2} />
      ))}
      {values.map((v, i) =>
        v != null && i !== lastIdx ? (
          <circle key={i} cx={x(i)} cy={y(v)} r={1.5} fill="var(--copper)" />
        ) : null,
      )}
      {last != null && (
        <circle cx={x(lastIdx)} cy={y(last)} r={3.5} fill="var(--surface-2)" stroke="var(--copper)" strokeWidth={2} />
      )}
    </svg>
  );
}

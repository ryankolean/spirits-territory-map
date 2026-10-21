interface Props {
  values: (number | null)[];
  width?: number;
  height?: number;
}

/** Five-year trend in copper; gaps where a year has no record, last point dotted. */
export function Sparkline({ values, width = 150, height = 36 }: Props) {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  const max = Math.max(...present, 1);
  const pad = 4;
  const x = (i: number) => pad + (i * (width - 2 * pad)) / Math.max(values.length - 1, 1);
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
      {segments.map((pts, i) => (
        <polyline key={i} points={pts} fill="none" stroke="var(--copper)" strokeWidth={2} />
      ))}
      {values.map((v, i) =>
        v != null && i !== lastIdx ? (
          <circle key={i} cx={x(i)} cy={y(v)} r={1.5} fill="var(--copper)" />
        ) : null,
      )}
      {last != null && (
        <circle cx={x(lastIdx)} cy={y(last)} r={3.5} fill="var(--surface-alt)" stroke="var(--copper)" strokeWidth={2} />
      )}
    </svg>
  );
}

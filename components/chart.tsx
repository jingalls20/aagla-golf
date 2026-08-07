/**
 * Minimal inline SVG line chart, carried over from the Apps Script app.
 *
 * Deliberately dependency-free and server-rendered: these charts show a
 * handful of points and never need to be interactive, so shipping a charting
 * library to do it would cost more than it gives. Native <title> elements
 * provide hover tooltips.
 */
export function LineChart({
  points,
  color = '#2f7a4d',
  height = 160,
  invertY = false,
  label,
}: {
  points: { x: number; y: number; label: string }[];
  color?: string;
  height?: number;
  /** For rankings, where 1 is best and should sit at the top. */
  invertY?: boolean;
  label?: string;
}) {
  if (points.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-400">Not enough data yet.</p>
    );
  }

  const w = 640;
  const pad = 28;
  const ys = points.map((p) => p.y);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }

  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const sx = (i: number) => pad + i * step;
  const sy = (v: number) => {
    const t = (v - minY) / (maxY - minY);
    const flipped = invertY ? t : 1 - t;
    return pad + flipped * (height - pad * 2);
  };

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(i)},${sy(p.y)}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      className="h-40 w-full"
      role="img"
      aria-label={label ?? 'Line chart'}
    >
      {[0, 1, 2, 3].map((g) => {
        const y = pad + (g * (height - pad * 2)) / 3;
        return (
          <line
            key={g}
            x1={pad}
            x2={w - pad}
            y1={y}
            y2={y}
            className="stroke-slate-200 dark:stroke-slate-800"
            strokeWidth={1}
          />
        );
      })}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle key={i} cx={sx(i)} cy={sy(p.y)} r={3.5} fill={color}>
          <title>{`${p.label}: ${p.y}`}</title>
        </circle>
      ))}
      <text x={pad} y={14} className="fill-slate-400 text-[10px]">
        {invertY ? minY : maxY}
      </text>
      <text x={pad} y={height - 6} className="fill-slate-400 text-[10px]">
        {invertY ? maxY : minY}
      </text>
    </svg>
  );
}

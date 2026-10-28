"use client";

import { useState } from "react";

const W = 640, H = 220, PAD = { l: 44, r: 12, t: 12, b: 26 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthText = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** A player's rating at the end of each month they played. */
export function EloChart({ data }: { data: { month: string; elo: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return <p className="text-sm text-ink-3">Not enough months played to draw a history yet.</p>;

  const lo = Math.floor(Math.min(...data.map((d) => d.elo)) / 50) * 50;
  const hi = Math.ceil(Math.max(...data.map((d) => d.elo)) / 50) * 50 || lo + 50;
  const x = (i: number) => PAD.l + (i / (data.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const step = Math.max(50, Math.ceil((hi - lo) / 4 / 50) * 50);
  const ticks = Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, k) => lo + k * step);
  // January of each year, or the first month shown.
  const years = data.map((d, i) => ({ d, i })).filter(({ d, i }) => i === 0 || d.month.endsWith("-01"));
  const h = hover != null ? data[hover] : null;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Elo rating by month, from ${Math.round(data[0].elo)} in ${monthText(data[0].month)} to ${Math.round(data.at(-1)!.elo)} now`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--text-3)">{t}</text>
          </g>
        ))}
        {years.map(({ d, i }) => (
          <text key={d.month} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : "middle"} fontSize={10} fill="var(--text-3)">{d.month.slice(0, 4)}</text>
        ))}
        <polyline fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" points={data.map((d, i) => `${x(i)},${y(d.elo)}`).join(" ")} />
        {h && hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(h.elo)} r={5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
        {/* One hit column per month, wider than the line. */}
        {data.map((d, i) => (
          <rect key={d.month} x={x(i) - (W - PAD.l - PAD.r) / (data.length - 1) / 2} y={PAD.t} width={(W - PAD.l - PAD.r) / (data.length - 1)} height={H - PAD.t - PAD.b} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {h && hover != null && (
        <div
          className="pointer-events-none absolute rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(h.elo) / H) * 100}%`, transform: `translate(${hover > data.length / 2 ? "calc(-100% - 10px)" : "10px"}, -50%)` }}
        >
          <div className="font-medium">{monthText(h.month)}</div>
          <div className="text-ink-2 tabular">Elo {Math.round(h.elo)}</div>
        </div>
      )}
    </div>
  );
}

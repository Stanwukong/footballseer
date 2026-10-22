"use client";

import { useState } from "react";

import { pct } from "@/lib/format";
import type { MarketSummary } from "@/lib/types";

const W = 320, H = 260, PAD = { l: 40, r: 12, t: 12, b: 34 };
const x = (v: number) => PAD.l + v * (W - PAD.l - PAD.r);
const y = (v: number) => H - PAD.b - v * (H - PAD.t - PAD.b);

/** Predicted probability vs how often it actually happened. On the diagonal = honest. */
export function CalibrationChart({ data }: { data: MarketSummary["calibration"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const h = hover != null ? data[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Calibration chart: predicted vs actual frequency">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--text-3)">{t * 100}%</text>
            <text x={x(t)} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="var(--text-3)">{t * 100}%</text>
          </g>
        ))}
        <text x={x(0.5)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text-2)">Predicted probability</text>
        <text transform={`translate(10 ${y(0.5)}) rotate(-90)`} textAnchor="middle" fontSize={10} fill="var(--text-2)">Actually happened</text>
        {/* Perfect calibration reference */}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--text-3)" strokeWidth={1} />
        <text x={x(0.97)} y={y(0.97)} dy={-6} textAnchor="end" fontSize={9} fill="var(--text-3)">perfect</text>
        <polyline
          fill="none"
          stroke="var(--series-1)"
          strokeWidth={2}
          strokeLinejoin="round"
          points={data.map((d) => `${x(d.predicted)},${y(d.actual)}`).join(" ")}
        />
        {data.map((d, i) => (
          <g key={d.bin} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle cx={x(d.predicted)} cy={y(d.actual)} r={14} fill="transparent" />
            <circle cx={x(d.predicted)} cy={y(d.actual)} r={hover === i ? 6 : 4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        ))}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: `${(x(h.predicted) / W) * 100}%`, top: `${(y(h.actual) / H) * 100}%`, transform: "translate(-50%, calc(-100% - 10px))" }}
        >
          <div className="font-medium">{Math.round(h.bin * 100)}–{Math.round(h.bin * 100) + 10}% bucket</div>
          <div className="text-ink-2 tabular">Predicted {pct(h.predicted, 1)} · Actual {pct(h.actual, 1)}</div>
          <div className="text-ink-3 tabular">{h.n.toLocaleString()} picks</div>
        </div>
      )}
    </div>
  );
}

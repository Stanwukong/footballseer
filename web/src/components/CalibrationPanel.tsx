"use client";

import { useState } from "react";

import { CalibrationChart } from "@/components/CalibrationChart";
import { LABELS, pct } from "@/lib/format";
import type { Summary } from "@/lib/types";

export function CalibrationPanel({ summary, labels = LABELS, initial = "O2.5" }: {
  summary: Pick<Summary, "markets">;
  labels?: Record<string, string>;
  initial?: string;
}) {
  const keys = Object.keys(summary.markets);
  const [m, setM] = useState(initial);
  const s = summary.markets[m] ?? summary.markets[keys[0]];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {keys.map((k) => (
            <button
              key={k}
              onClick={() => setM(k)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${k === m ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:text-ink"}`}
            >
              {labels[k] ?? k}
            </button>
          ))}
        </div>
        <CalibrationChart data={s.calibration} />
      </div>
      <div>
        <div className="mb-2 text-sm font-semibold">{labels[m] ?? m}: hit rate by confidence</div>
        <p className="mb-3 text-xs text-ink-3">
          If you only took picks the model rated at least X% likely, this is how often they won.
          Base rate across all matches: {pct(s.base_rate)}. Brier score {s.brier.toFixed(3)} (lower is better).
        </p>
        <table className="w-full text-sm tabular">
          <thead className="text-left text-xs text-ink-3">
            <tr><th className="py-1 font-normal">Model says ≥</th><th className="py-1 text-right font-normal">Picks</th><th className="py-1 text-right font-normal">Won</th></tr>
          </thead>
          <tbody>
            {s.thresholds.map((t) => (
              <tr key={t.min_p} className="border-t border-line">
                <td className="py-1.5">{pct(t.min_p)}</td>
                <td className="py-1.5 text-right">{t.n.toLocaleString()}</td>
                <td className="py-1.5 text-right font-medium">{t.n ? pct(t.hit_rate, 1) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

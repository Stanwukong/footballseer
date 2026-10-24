"use client";

import { useState } from "react";

import { Odds } from "@/components/client";
import { Segmented } from "@/components/TeamTables";
import { Meter } from "@/components/ui";
import { marketName, PERIOD_GROUPS, PERIOD_NAMES, PERIODS } from "@/lib/basketball/format";
import type { Lines, Probs } from "@/lib/basketball/types";
import { pct } from "@/lib/format";

const SHORT: Record<string, string> = { H1: "1st half", H2: "2nd half", Q1: "Q1", Q2: "Q2", Q3: "Q3", Q4: "Q4" };

/**
 * Halves and quarters, one period at a time: result (three-way, a period can
 * end level), spread, total and team totals at the period's lines.
 */
export function PeriodMarkets({ p, lines, home, away, pts, shares }: {
  p: Probs;
  lines: Lines;
  home: string;
  away: string;
  /** Expected points for the game, scaled by each period's share for the headline. */
  pts: [number, number];
  shares: Record<string, number>;
}) {
  const periods = PERIODS.filter((x) => p[`${x}_1`] != null);
  const [period, setPeriod] = useState<string>(periods[0] ?? "H1");
  if (!periods.length) return <p className="text-sm text-ink-3">No period markets for this league.</p>;
  const share = shares[period];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Period" value={period} onChange={setPeriod} options={periods.map((x) => ({ id: x, label: SHORT[x] }))} />
        {share != null && (
          <span className="text-xs text-ink-3 tabular">
            Expected {PERIOD_NAMES[period]}: <span className="font-semibold text-ink">{(pts[0] * share).toFixed(1)} – {(pts[1] * share).toFixed(1)}</span>
            {period === "H2" && " · includes overtime"}
            {period === "Q4" && " · regulation only"}
          </span>
        )}
      </div>
      <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
        {PERIOD_GROUPS(period).map((g) => {
          const keys = g.keys.filter((k) => p[k] != null);
          if (!keys.length) return null;
          return (
            <div key={g.title} className="min-w-0">
              <div className="eyebrow mb-2">{g.title}</div>
              <table className="w-full text-sm tabular">
                <tbody>
                  {keys.map((k) => (
                    <tr key={k} className="border-b border-line/70 last:border-0">
                      <td className="max-w-0 truncate py-1.5 pr-3">{marketName(k, lines, home, away).replace(` the ${PERIOD_NAMES[period]}`, "").replace(` ${PERIOD_NAMES[period]}`, "")}</td>
                      <td className="w-20 py-1.5 sm:w-24"><Meter value={p[k]} /></td>
                      <td className="w-12 py-1.5 text-right font-semibold">{pct(p[k])}</td>
                      <td className="w-14 py-1.5 text-right text-xs"><Odds p={p[k]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}

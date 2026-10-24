"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Card, chip, CountryTag, cx, Field } from "@/components/ui";
import { season } from "@/lib/format";
import type { LeagueInfo, LeagueProfile } from "@/lib/types";

export interface LeagueStatRow extends LeagueInfo {
  profile: LeagueProfile;
  fixtures: number;
}

type Metric = { key: string; label: string; get: (p: LeagueProfile) => number | undefined; pct: boolean };

const rate = (k: string, under = false) => (p: LeagueProfile) => (p.rates[k] == null ? undefined : under ? 1 - p.rates[k] : p.rates[k]);

const METRICS: Metric[] = [
  ...[0.5, 1.5, 2.5, 3.5, 4.5, 5.5].flatMap((l) => [
    { key: `O${l}`, label: `+${l} goals`, get: rate(`O${l}`), pct: true },
    { key: `U${l}`, label: `−${l} goals`, get: rate(`O${l}`, true), pct: true },
  ]),
  { key: "BTTS_Y", label: "BTTS yes", get: rate("BTTS_Y"), pct: true },
  { key: "BTTS_N", label: "BTTS no", get: rate("BTTS_Y", true), pct: true },
  { key: "1", label: "Home wins", get: rate("1"), pct: true },
  { key: "X", label: "Draws", get: rate("X"), pct: true },
  { key: "2", label: "Away wins", get: rate("2"), pct: true },
  { key: "HT_O0.5", label: "1st-half goal", get: rate("HT_O0.5"), pct: true },
  { key: "h1", label: "% goals in 1st half", get: (p) => p.h1_share, pct: true },
  { key: "goals", label: "Goals / match", get: (p) => p.goals, pct: false },
  { key: "home", label: "Home goals / match", get: (p) => p.home_goals, pct: false },
  { key: "away", label: "Away goals / match", get: (p) => p.away_goals, pct: false },
  { key: "corners", label: "Corners / match", get: (p) => p.corners, pct: false },
  { key: "yellows", label: "Yellow cards / match", get: (p) => p.yellows, pct: false },
  { key: "reds", label: "Red cards / match", get: (p) => p.reds, pct: false },
];

/** Rank leagues by how often a market lands, as on BetMines' league stats. */
export function LeagueStatsBoard({ rows }: { rows: LeagueStatRow[] }) {
  const [metric, setMetric] = useState("O2.5");
  const [upcoming, setUpcoming] = useState(false);
  const m = METRICS.find((x) => x.key === metric)!;
  const list = useMemo(
    () =>
      rows
        .filter((r) => !upcoming || r.fixtures > 0)
        .map((r) => ({ r, v: m.get(r.profile) }))
        .filter((x): x is { r: LeagueStatRow; v: number } => x.v != null)
        .sort((a, b) => b.v - a.v),
    [rows, upcoming, m],
  );
  const max = Math.max(...list.map((x) => x.v), m.pct ? 1 : 0);

  return (
    <div className="space-y-4">
      <Card>
        <Field label="Event">
          <div className="flex flex-wrap gap-1.5">
            {METRICS.map((x) => (
              <button key={x.key} type="button" className={cx(chip(metric === x.key), "py-1 text-xs")} onClick={() => setMetric(x.key)}>{x.label}</button>
            ))}
          </div>
        </Field>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={upcoming} onChange={(e) => setUpcoming(e.target.checked)} /> Only leagues with upcoming matches
        </label>
      </Card>
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <ol className="divide-y divide-line">
          {list.map(({ r, v }, i) => (
            <li key={r.code}>
              <Link href={`/leagues/${r.code}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/70">
                <span className="w-6 shrink-0 font-mono text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <CountryTag country={r.country} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="text-xs text-ink-3 tabular">{r.country} · {r.profile.n} matches, season {season(r.profile.season)}</div>
                </div>
                <div className="w-28 shrink-0 sm:w-48">
                  <div className="text-right text-sm font-semibold tabular">{m.pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(2)}</div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(v / max) * 100}%` }} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

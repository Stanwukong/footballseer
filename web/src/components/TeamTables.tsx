"use client";

import { useState } from "react";

import { cx, FormChips, HitRate } from "@/components/ui";
import { shortDate } from "@/lib/format";
import type { Rate, StandingRow, TeamMatch, TeamStats } from "@/lib/types";

export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface-2 p-0.5 scrollbar-none">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx(
            "h-7 shrink-0 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
            value === o.id ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type TableView = "all" | "home" | "away";

/** League table; `highlight` teams are tinted (the two sides of a match). */
export function StandingsTable({ rows, highlight = [], compact = false }: { rows: StandingRow[]; highlight?: string[]; compact?: boolean }) {
  const [view, setView] = useState<TableView>("all");
  const sorted = view === "all" ? rows : [...rows].sort((a, b) => b[view][6] - a[view][6] || (b[view][4] - b[view][5]) - (a[view][4] - a[view][5]) || b[view][4] - a[view][4]);
  if (!rows.length) return <p className="text-sm text-ink-3">No league matches played this season yet.</p>;
  return (
    <div>
      <div className="mb-3">
        <Segmented label="Table view" value={view} onChange={setView} options={[{ id: "all", label: "Total" }, { id: "home", label: "Home" }, { id: "away", label: "Away" }]} />
      </div>
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full min-w-[480px] text-sm tabular">
          <thead className="text-left text-[11px] tracking-wider text-ink-3 uppercase">
            <tr className="border-b border-line">
              <th className="w-8 py-2 pl-4 font-medium sm:pl-5">#</th>
              <th className="py-2 font-medium">Team</th>
              <th className="py-2 text-right font-medium">P</th>
              <th className="py-2 text-right font-medium">W</th>
              <th className="py-2 text-right font-medium">D</th>
              <th className="py-2 text-right font-medium">L</th>
              <th className="py-2 text-right font-medium">Goals</th>
              <th className="py-2 text-right font-medium">GD</th>
              <th className="py-2 pr-3 text-right font-medium">Pts</th>
              {!compact && <th className="hidden py-2 pr-4 font-medium sm:table-cell sm:pr-5">Form</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const [p, w, d, l, gf, ga, pts] = r[view];
              const hl = highlight.includes(r.team);
              return (
                <tr key={r.team} className={cx("border-b border-line last:border-0", hl && "bg-accent-soft/60")}>
                  <td className="py-2 pl-4 text-ink-3 sm:pl-5">{i + 1}</td>
                  <td className={cx("py-2 pr-2", hl && "font-semibold")}>{r.team}</td>
                  <td className="py-2 text-right text-ink-2">{p}</td>
                  <td className="py-2 text-right text-ink-2">{w}</td>
                  <td className="py-2 text-right text-ink-2">{d}</td>
                  <td className="py-2 text-right text-ink-2">{l}</td>
                  <td className="py-2 text-right text-ink-2">{gf}:{ga}</td>
                  <td className="py-2 text-right text-ink-2">{gf - ga > 0 ? "+" : ""}{gf - ga}</td>
                  <td className="py-2 pr-3 text-right font-semibold">{pts}</td>
                  {!compact && <td className="hidden py-2 pr-4 sm:table-cell sm:pr-5"><FormChips form={r.form} size="sm" /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function resultOf(m: TeamMatch) {
  return m[3] > m[4] ? "W" : m[3] === m[4] ? "D" : "L";
}

function MatchList({ team, matches }: { team: string; matches: TeamMatch[] }) {
  const w = matches.filter((m) => resultOf(m) === "W").length;
  const d = matches.filter((m) => resultOf(m) === "D").length;
  const gf = matches.reduce((s, m) => s + m[3], 0);
  const ga = matches.reduce((s, m) => s + m[4], 0);
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="truncate font-semibold">{team}</h3>
        <span className="shrink-0 text-xs text-ink-3 tabular">{w}W {d}D {matches.length - w - d}L</span>
      </div>
      {matches.length === 0 ? (
        <p className="text-sm text-ink-3">No matches.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {matches.map((m) => {
            const r = resultOf(m);
            return (
              <li key={m[0] + m[1]} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                <FormChips form={r} size="sm" />
                <span className="w-12 shrink-0 font-mono text-[11px] text-ink-3">{shortDate(m[0])}</span>
                <span className="w-4 shrink-0 font-mono text-[11px] text-ink-3">{m[2] === "H" ? "H" : "A"}</span>
                <span className="min-w-0 flex-1 truncate">{m[1]}</span>
                {m[5] != null && <span className="hidden font-mono text-[11px] text-ink-3 sm:inline">HT {m[5]}-{m[6]}</span>}
                <span className="font-mono font-semibold tabular">{m[3]}-{m[4]}</span>
              </li>
            );
          })}
        </ul>
      )}
      {matches.length > 0 && (
        <div className="mt-2 flex gap-4 text-xs text-ink-3 tabular">
          <span>Scored <span className="font-semibold text-ink">{gf}</span> ({(gf / matches.length).toFixed(1)}/game)</span>
          <span>Conceded <span className="font-semibold text-ink">{ga}</span> ({(ga / matches.length).toFixed(1)}/game)</span>
        </div>
      )}
    </div>
  );
}

export function LastMatches({ home, away, hs, as }: { home: string; away: string; hs?: TeamStats; as?: TeamStats }) {
  const [view, setView] = useState<"5" | "10" | "venue">("5");
  const pick = (s: TeamStats | undefined, venue: "H" | "A") => {
    const all = s?.last ?? [];
    return view === "5" ? all.slice(0, 5) : view === "10" ? all : all.filter((m) => m[2] === venue).slice(0, 5);
  };
  return (
    <div>
      <div className="mb-4">
        <Segmented label="Matches shown" value={view} onChange={setView} options={[{ id: "5", label: "Last 5" }, { id: "10", label: "Last 10" }, { id: "venue", label: "Home / away" }]} />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <MatchList team={home} matches={pick(hs, "H")} />
        <MatchList team={away} matches={pick(as, "A")} />
      </div>
    </div>
  );
}

const STAT_ROWS: { label: string; key: string; ht?: boolean }[] = [
  { label: "Over 0.5 goals", key: "O0.5" },
  { label: "Over 1.5 goals", key: "O1.5" },
  { label: "Over 2.5 goals", key: "O2.5" },
  { label: "Over 3.5 goals", key: "O3.5" },
  { label: "Over 4.5 goals", key: "O4.5" },
  { label: "Both teams score", key: "BTTS_Y" },
  { label: "Win", key: "W" },
  { label: "Draw", key: "D" },
  { label: "Loss", key: "L" },
  { label: "Clean sheet", key: "CS" },
  { label: "Failed to score", key: "FTS" },
  { label: "Goal in 1st half", key: "HT_O0.5", ht: true },
  { label: "2+ goals in 1st half", key: "HT_O1.5", ht: true },
];

/** Side-by-side market hit rates for the two teams, as on BetMines' pre-match stats. */
export function StatsCompare({ home, away, hs, as }: { home: string; away: string; hs?: TeamStats; as?: TeamStats }) {
  const [view, setView] = useState<"l10" | "venue" | "all">("l10");
  const rate = (s: TeamStats | undefined, venue: "home" | "away"): Rate | undefined =>
    s ? (view === "l10" ? s.rates.l10 : view === "all" ? s.rates.all : s.rates[venue]) : undefined;
  const h = rate(hs, "home"), a = rate(as, "away");
  const avg = (r: Rate | undefined, k: "gf" | "ga") => (r?.n ? ((r[k] ?? 0) / r.n).toFixed(2) : "–");
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Sample"
          value={view}
          onChange={setView}
          options={[{ id: "l10", label: "Last 10" }, { id: "venue", label: "Home / away, season" }, { id: "all", label: "Season" }]}
        />
        <span className="text-xs text-ink-3 tabular">{h?.n ?? 0} and {a?.n ?? 0} matches</span>
      </div>
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full text-sm">
          <thead className="text-[11px] tracking-wider text-ink-3 uppercase">
            <tr className="border-b border-line">
              <th className="py-2 pl-4 text-left font-medium sm:pl-5">Event</th>
              <th className="max-w-28 truncate py-2 text-right font-medium">{home}</th>
              <th className="max-w-28 truncate py-2 pr-4 text-right font-medium sm:pr-5">{away}</th>
            </tr>
          </thead>
          <tbody>
            {STAT_ROWS.map((r) => (
              <tr key={r.key} className="border-b border-line last:border-0">
                <td className="py-2 pl-4 text-ink-2 sm:pl-5">{r.label}</td>
                <td className="py-2 text-right"><HitRate hits={h?.c?.[r.key]} n={r.ht ? h?.nht : h?.n} /></td>
                <td className="py-2 pr-4 text-right sm:pr-5"><HitRate hits={a?.c?.[r.key]} n={r.ht ? a?.nht : a?.n} /></td>
              </tr>
            ))}
            <tr className="border-b border-line">
              <td className="py-2 pl-4 text-ink-2 sm:pl-5">Goals scored / game</td>
              <td className="py-2 text-right font-semibold tabular">{avg(h, "gf")}</td>
              <td className="py-2 pr-4 text-right font-semibold tabular sm:pr-5">{avg(a, "gf")}</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-2 pl-4 text-ink-2 sm:pl-5">Goals conceded / game</td>
              <td className="py-2 text-right font-semibold tabular">{avg(h, "ga")}</td>
              <td className="py-2 pr-4 text-right font-semibold tabular sm:pr-5">{avg(a, "ga")}</td>
            </tr>
            {(h?.corners || a?.corners) && (
              <tr>
                <td className="py-2 pl-4 text-ink-2 sm:pl-5">Corners for / against</td>
                <td className="py-2 text-right tabular">{h?.corners ? `${h.corners[0]} / ${h.corners[1]}` : "–"}</td>
                <td className="py-2 pr-4 text-right tabular sm:pr-5">{a?.corners ? `${a.corners[0]} / ${a.corners[1]}` : "–"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

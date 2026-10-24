"use client";

import Link from "next/link";
import { useState } from "react";

import { Segmented } from "@/components/TeamTables";
import { cx, FormChips, HitRate } from "@/components/ui";
import { EVENT_LABELS, eventN, winPct } from "@/lib/basketball/format";
import type { Rate, StandingRow, TeamGame, TeamStats } from "@/lib/basketball/types";
import { shortDate } from "@/lib/format";

type View = "all" | "home" | "away";

/** Season table by win percentage; `highlight` teams are tinted. Long tables (NCAA) collapse to the top 30. */
export function StandingsTable({ rows, highlight = [], compact = false }: { rows: StandingRow[]; highlight?: string[]; compact?: boolean }) {
  const [view, setView] = useState<View>("all");
  const [all, setAll] = useState(false);
  if (!rows.length) return <p className="text-sm text-ink-3">No games played this season yet.</p>;
  const pctOf = (r: StandingRow) => (r[view][0] ? r[view][1] / r[view][0] : 0);
  const sorted = view === "all" ? rows : [...rows].sort((a, b) => pctOf(b) - pctOf(a) || (b[view][3] - b[view][4]) - (a[view][3] - a[view][4]));
  const leader = sorted[0][view];
  const long = sorted.length > 40;
  const shown = long && !all ? sorted.filter((r, i) => i < 30 || highlight.includes(r.team)) : sorted;
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
              <th className="py-2 text-right font-medium">W</th>
              <th className="py-2 text-right font-medium">L</th>
              <th className="py-2 text-right font-medium">Pct</th>
              <th className="py-2 text-right font-medium">GB</th>
              <th className="py-2 text-right font-medium" title="Points for and against per game">PF / PA</th>
              <th className="py-2 pr-3 text-right font-medium">Diff</th>
              {!compact && <th className="hidden py-2 pr-4 font-medium sm:table-cell sm:pr-5">Form</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const [p, w, l, pf, pa] = r[view];
              const gb = ((leader[1] - w) + (l - leader[2])) / 2;
              const hl = highlight.includes(r.team);
              const diff = p ? (pf - pa) / p : 0;
              return (
                <tr key={r.team} className={cx("border-b border-line last:border-0", hl && "bg-accent-soft/60")}>
                  <td className="py-2 pl-4 text-ink-3 sm:pl-5">{sorted.indexOf(r) + 1}</td>
                  <td className={cx("max-w-48 truncate py-2 pr-2", hl && "font-semibold")}>{r.team}</td>
                  <td className="py-2 text-right">{w}</td>
                  <td className="py-2 text-right">{l}</td>
                  <td className="py-2 text-right font-semibold">{winPct(w, p)}</td>
                  <td className="py-2 text-right text-ink-2">{gb === 0 ? "–" : gb.toFixed(1)}</td>
                  <td className="py-2 text-right text-ink-2">{p ? `${(pf / p).toFixed(1)} / ${(pa / p).toFixed(1)}` : "–"}</td>
                  <td className={cx("py-2 pr-3 text-right", diff > 0 ? "text-good" : diff < 0 ? "text-bad" : "text-ink-2")}>{diff > 0 ? "+" : ""}{diff.toFixed(1)}</td>
                  {!compact && <td className="hidden py-2 pr-4 sm:table-cell sm:pr-5"><FormChips form={r.form} size="sm" /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {long && (
        <button type="button" onClick={() => setAll((x) => !x)} className="mt-3 text-sm text-accent-text hover:underline">
          {all ? "Show top 30" : `Show all ${sorted.length} teams`}
        </button>
      )}
    </div>
  );
}

const resultOf = (g: TeamGame) => (g[3] > g[4] ? "W" : "L");

function GameList({ team, games }: { team: string; games: TeamGame[] }) {
  const w = games.filter((g) => resultOf(g) === "W").length;
  const pf = games.reduce((s, g) => s + g[3], 0);
  const pa = games.reduce((s, g) => s + g[4], 0);
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="truncate font-semibold">{team}</h3>
        <span className="shrink-0 text-xs text-ink-3 tabular">{w}–{games.length - w}</span>
      </div>
      {games.length === 0 ? (
        <p className="text-sm text-ink-3">No games.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {games.map((g) => (
            <li key={g[0] + g[1]} className="flex items-center gap-2.5 px-3 py-2 text-sm">
              <FormChips form={resultOf(g)} size="sm" />
              <span className="w-12 shrink-0 font-mono text-[11px] text-ink-3">{shortDate(g[0])}</span>
              <span className="w-4 shrink-0 font-mono text-[11px] text-ink-3">{g[2] === "A" ? "@" : g[2] === "N" ? "N" : "v"}</span>
              <span className="min-w-0 flex-1 truncate">{g[1]}</span>
              {g[5] != null && <span className="hidden font-mono text-[11px] text-ink-3 sm:inline">HT {g[5]}-{g[6]}</span>}
              <span className="font-mono font-semibold tabular">{g[3]}-{g[4]}{g[7] ? <span className="ml-0.5 text-[10px] text-ink-3">OT</span> : null}</span>
            </li>
          ))}
        </ul>
      )}
      {games.length > 0 && (
        <div className="mt-2 flex gap-4 text-xs text-ink-3 tabular">
          <span>Scored <span className="font-semibold text-ink">{(pf / games.length).toFixed(1)}</span>/game</span>
          <span>Allowed <span className="font-semibold text-ink">{(pa / games.length).toFixed(1)}</span>/game</span>
        </div>
      )}
    </div>
  );
}

export function LastGames({ home, away, hs, as }: { home: string; away: string; hs?: TeamStats; as?: TeamStats }) {
  const [view, setView] = useState<"5" | "10" | "venue">("5");
  const pick = (s: TeamStats | undefined, venue: "H" | "A") => {
    const all = s?.last ?? [];
    return view === "5" ? all.slice(0, 5) : view === "10" ? all : all.filter((g) => g[2] === venue).slice(0, 5);
  };
  return (
    <div>
      <div className="mb-4">
        <Segmented label="Games shown" value={view} onChange={setView} options={[{ id: "5", label: "Last 5" }, { id: "10", label: "Last 10" }, { id: "venue", label: "Home / road" }]} />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <GameList team={home} games={pick(hs, "H")} />
        <GameList team={away} games={pick(as, "A")} />
      </div>
    </div>
  );
}

const STAT_ROWS = ["W", "W10", "L10", "CLOSE", "OVR", "UND", "SA", "CA", "Q1W", "H1W", "H2W", "CB", "OT"];

/** Side-by-side event rates for the two teams. */
export function StatsCompare({ home, away, hs, as }: { home: string; away: string; hs?: TeamStats; as?: TeamStats }) {
  const [view, setView] = useState<"l10" | "venue" | "all">("l10");
  const rate = (s: TeamStats | undefined, venue: "home" | "away"): Rate | undefined =>
    s ? (view === "l10" ? s.rates.l10 : view === "all" ? s.rates.all : s.rates[venue]) : undefined;
  const h = rate(hs, "home"), a = rate(as, "away");
  const avg = (r: Rate | undefined, k: "pf" | "pa") => (r?.n ? ((r[k] ?? 0) / r.n).toFixed(1) : "–");
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented label="Sample" value={view} onChange={setView} options={[{ id: "l10", label: "Last 10" }, { id: "venue", label: "Home / road, season" }, { id: "all", label: "Season" }]} />
        <span className="text-xs text-ink-3 tabular">{h?.n ?? 0} and {a?.n ?? 0} games</span>
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
            {STAT_ROWS.map((k) => (
              <tr key={k} className="border-b border-line last:border-0">
                <td className="py-2 pl-4 text-ink-2 sm:pl-5">{EVENT_LABELS[k]}</td>
                <td className="py-2 text-right"><HitRate hits={h?.c?.[k]} n={h ? eventN(h, k) : undefined} /></td>
                <td className="py-2 pr-4 text-right sm:pr-5"><HitRate hits={a?.c?.[k]} n={a ? eventN(a, k) : undefined} /></td>
              </tr>
            ))}
            <tr className="border-b border-line">
              <td className="py-2 pl-4 text-ink-2 sm:pl-5">Points scored / game</td>
              <td className="py-2 text-right font-semibold tabular">{avg(h, "pf")}</td>
              <td className="py-2 pr-4 text-right font-semibold tabular sm:pr-5">{avg(a, "pf")}</td>
            </tr>
            <tr>
              <td className="py-2 pl-4 text-ink-2 sm:pl-5">Points allowed / game</td>
              <td className="py-2 text-right font-semibold tabular">{avg(h, "pa")}</td>
              <td className="py-2 pr-4 text-right font-semibold tabular sm:pr-5">{avg(a, "pa")}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-3">Above/below-average totals and scoring compare with this league&apos;s season average.</p>
    </div>
  );
}

/** Small link to a league page, for lists. */
export function LeagueName({ code, name, country }: { code: string; name: string; country: string }) {
  return <Link href={`/basketball/leagues/${code}`} className="hover:text-accent-text">{country} · {name}</Link>;
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { WinBar, MarginBands, MarketsGrid } from "@/components/basketball/MarketsGrid";
import { LeaguePicker } from "@/components/Pickers";
import { Segmented } from "@/components/TeamTables";
import { Card, CardTitle, chip, CountryTag, cx, EmptyState, Field } from "@/components/ui";
import { EVENT_LABELS, eventN } from "@/lib/basketball/format";
import { bands, expected, markets, modelLines } from "@/lib/basketball/model";
import type { League, LeagueInfo, LeagueProfile, Rate } from "@/lib/basketball/types";
import { formatDay } from "@/lib/format";

// --------------------------------------------------------------------------- //
// Team stats: which teams hit an event most often
// --------------------------------------------------------------------------- //

export interface TeamRow {
  team: string;
  league: string;
  rates: { l10: Rate; all: Rate; home: Rate; away: Rate };
  next?: { id: string; date: string; time: string; home: string; away: string };
}

const TEAM_EVENTS = ["W", "L", "W10", "L10", "CLOSE", "OVR", "UND", "SA", "CA", "H1W", "H1L", "H2W", "H2L", "Q1W", "Q1L", "CB", "OT"];

export function TeamStatsBoard({ rows, leagues, today }: { rows: TeamRow[]; leagues: LeagueInfo[]; today: string }) {
  const [event, setEvent] = useState("W");
  const [sample, setSample] = useState<"l10" | "all" | "home" | "away">("l10");
  const [lgs, setLgs] = useState<string[]>([]);
  const [upcoming, setUpcoming] = useState(true);
  const [minN, setMinN] = useState(5);
  const byCode = useMemo(() => Object.fromEntries(leagues.map((l) => [l.code, l])), [leagues]);

  const list = useMemo(() => {
    const out = [];
    for (const r of rows) {
      if (upcoming && !r.next) continue;
      if (lgs.length && !lgs.includes(r.league)) continue;
      const rate = r.rates[sample];
      const n = eventN(rate, event);
      const hits = rate.c?.[event];
      if (!n || hits == null || n < minN) continue;
      out.push({ r, hits, n, rate: hits / n });
    }
    return out.sort((a, b) => b.rate - a.rate || b.hits - a.hits);
  }, [rows, upcoming, lgs, sample, event, minN]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-4">
          <Field label="Event">
            <div className="flex flex-wrap gap-1.5">
              {TEAM_EVENTS.map((e) => (
                <button key={e} type="button" className={cx(chip(event === e), "py-1 text-xs")} onClick={() => setEvent(e)}>{EVENT_LABELS[e]}</button>
              ))}
            </div>
          </Field>
          <div className="grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-end">
            <Field label="Sample">
              <Segmented label="Sample" value={sample} onChange={setSample} options={[{ id: "l10", label: "Last 10" }, { id: "all", label: "Season" }, { id: "home", label: "Home" }, { id: "away", label: "Road" }]} />
            </Field>
            <Field label="Leagues">
              <LeaguePicker leagues={leagues} value={lgs} onChange={setLgs} />
            </Field>
            <Field label={<>Min. games: <span className="text-ink tabular">{minN}</span></>}>
              <input type="range" min={1} max={10} value={minN} onChange={(e) => setMinN(Number(e.target.value))} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={upcoming} onChange={(e) => setUpcoming(e.target.checked)} /> Only teams with an upcoming game</label>
        </div>
      </Card>

      {list.length === 0 ? (
        <EmptyState title="No teams match">Lower the minimum games or include teams without fixtures. Out of season, no team has an upcoming game.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <ol className="divide-y divide-line">
            {list.slice(0, 150).map(({ r, hits, n, rate }, i) => (
              <li key={`${r.league}-${r.team}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-6 shrink-0 font-mono text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.team}</div>
                  <div className="truncate text-xs text-ink-3">{byCode[r.league]?.country} · {byCode[r.league]?.name}</div>
                </div>
                {r.next && (
                  <Link href={`/basketball/match/${r.next.id}`} className="hidden min-w-0 flex-1 text-right text-xs text-ink-2 hover:text-accent-text md:block">
                    <span className="block truncate">{r.next.home} v {r.next.away}</span>
                    <span className="block font-mono text-[11px] text-ink-3">{formatDay(r.next.date, today)} {r.next.time}</span>
                  </Link>
                )}
                <div className="w-24 shrink-0 sm:w-36">
                  <div className="flex items-baseline justify-end gap-1.5 tabular">
                    <span className="font-semibold">{Math.round(rate * 100)}%</span>
                    <span className="text-xs text-ink-3">{hits}/{n}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${rate * 100}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// League stats: rank leagues by how they play
// --------------------------------------------------------------------------- //

export interface LeagueStatRow extends LeagueInfo {
  profile: LeagueProfile;
  fixtures: number;
}

type Metric = { key: string; label: string; get: (p: LeagueProfile) => number | undefined; pct: boolean };
const rate = (k: string) => (p: LeagueProfile) => p.rates[k];

const METRICS: Metric[] = [
  { key: "total", label: "Points / game", get: (p) => p.total, pct: false },
  { key: "home_pts", label: "Home points", get: (p) => p.home_pts, pct: false },
  { key: "away_pts", label: "Away points", get: (p) => p.away_pts, pct: false },
  { key: "margin", label: "Average margin", get: (p) => p.margin, pct: false },
  { key: "1", label: "Home wins", get: rate("1"), pct: true },
  { key: "2", label: "Away wins", get: rate("2"), pct: true },
  { key: "CLOSE", label: "Decided by ≤5", get: rate("CLOSE"), pct: true },
  { key: "BIG", label: "Decided by 10+", get: rate("BIG"), pct: true },
  { key: "BLOW", label: "Decided by 20+", get: rate("BLOW"), pct: true },
  { key: "OT", label: "Overtime", get: rate("OT"), pct: true },
  { key: "H1_1", label: "Home wins 1st half", get: rate("H1_1"), pct: true },
  { key: "H2_1", label: "Home wins 2nd half", get: rate("H2_1"), pct: true },
  { key: "Q1_1", label: "Home wins 1st quarter", get: rate("Q1_1"), pct: true },
  { key: "CB", label: "Half-time leader loses", get: rate("CB"), pct: true },
  { key: "h1", label: "% points in 1st half", get: (p) => p.h1_share, pct: true },
  ...[0, 1, 2, 3].map((k) => ({ key: `q${k + 1}`, label: `% points in Q${k + 1}`, get: (p: LeagueProfile) => p.q_share?.[k], pct: true })),
];

export function LeagueStatsBoard({ rows }: { rows: LeagueStatRow[] }) {
  const [metric, setMetric] = useState("total");
  const [upcoming, setUpcoming] = useState(false);
  const m = METRICS.find((x) => x.key === metric)!;
  const list = useMemo(
    () => rows.filter((r) => !upcoming || r.fixtures > 0).map((r) => ({ r, v: m.get(r.profile) })).filter((x): x is { r: LeagueStatRow; v: number } => x.v != null).sort((a, b) => b.v - a.v),
    [rows, upcoming, m],
  );
  const max = Math.max(...list.map((x) => x.v), m.pct ? 1 : 0);
  return (
    <div className="space-y-4">
      <Card>
        <Field label="Measure">
          <div className="flex flex-wrap gap-1.5">
            {METRICS.map((x) => <button key={x.key} type="button" className={cx(chip(metric === x.key), "py-1 text-xs")} onClick={() => setMetric(x.key)}>{x.label}</button>)}
          </div>
        </Field>
        <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={upcoming} onChange={(e) => setUpcoming(e.target.checked)} /> Only leagues with upcoming games</label>
      </Card>
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <ol className="divide-y divide-line">
          {list.map(({ r, v }, i) => (
            <li key={r.code}>
              <Link href={`/basketball/leagues/${r.code}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/70">
                <span className="w-6 shrink-0 font-mono text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <CountryTag country={r.country} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="text-xs text-ink-3 tabular">{r.country} · {r.profile.n} games, season {r.profile.season}</div>
                </div>
                <div className="w-28 shrink-0 sm:w-48">
                  <div className="text-right text-sm font-semibold tabular">{m.pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(1)}</div>
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

// --------------------------------------------------------------------------- //
// Matchup predictor
// --------------------------------------------------------------------------- //

export function Predictor({ leagues }: { leagues: League[] }) {
  const [code, setCode] = useState(leagues[0]?.code ?? "");
  const league = leagues.find((l) => l.code === code);
  const [home, setHome] = useState(league?.teams[0]?.team ?? "");
  const [away, setAway] = useState(league?.teams[1]?.team ?? "");
  const [neutral, setNeutral] = useState(false);

  const pickLeague = (c: string) => {
    const l = leagues.find((x) => x.code === c)!;
    setCode(c);
    setHome(l.teams[0]?.team ?? "");
    setAway(l.teams[1]?.team ?? "");
  };

  const result = useMemo(() => {
    if (!league || !home || !away || home === away) return null;
    const [eh, ea] = expected(league, home, away, neutral);
    const lines = modelLines(league, eh, ea);
    return { eh, ea, lines, p: markets(league, eh, ea, lines), bands: bands(league.sigma_m, eh, ea) };
  }, [league, home, away, neutral]);

  const select = "mt-1.5 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-ink hover:border-line-strong";
  const teams = league?.teams.map((t) => t.team).sort() ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <label className="eyebrow">League
            <select className={select} value={code} onChange={(e) => pickLeague(e.target.value)}>
              {leagues.map((l) => <option key={l.code} value={l.code}>{l.country} · {l.name}</option>)}
            </select>
          </label>
          <label className="eyebrow">Home
            <select className={select} value={home} onChange={(e) => setHome(e.target.value)}>{teams.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="eyebrow">Away
            <select className={select} value={away} onChange={(e) => setAway(e.target.value)}>{teams.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={neutral} onChange={(e) => setNeutral(e.target.checked)} /> Neutral floor</label>
        </div>
      </Card>
      {!result ? (
        <p className="text-sm text-ink-3">Pick two different teams.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardTitle hint={`Expected score ${result.eh.toFixed(1)} – ${result.ea.toFixed(1)}. Lines are the model's fair spread and the league's average total.`}>{home} v {away}</CardTitle>
            <WinBar p={result.p} home={home} away={away} size="lg" />
            <div className="mt-6"><MarketsGrid p={result.p} lines={result.lines} home={home} away={away} /></div>
          </Card>
          <Card>
            <CardTitle>Winning margin</CardTitle>
            <MarginBands bands={result.bands} home={home} away={away} />
          </Card>
        </div>
      )}
    </div>
  );
}

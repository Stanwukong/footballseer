"use client";

import { CalendarClock, Search, Star } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";

import { GameStatus } from "@/components/basketball/live";
import { Odds, StarButton } from "@/components/client";
import { LiveDot } from "@/components/live";
import { chip, CountryTag, cx, EmptyState, ProbPill, ResultMark } from "@/components/ui";
import { liveSettle, MARKET_TABS, pickText, PRICED, settle, tabPick, type Pick as Tip } from "@/lib/basketball/format";
import { liveState } from "@/lib/basketball/model";
import type { FixtureSlim, LeagueInfo, Lines, LiveEvent, PeriodScores, Result } from "@/lib/basketball/types";
import { addDays, formatDay, pct, shortDate } from "@/lib/format";
import { useBasketballFeed } from "@/lib/live-client";
import { useFavourites } from "@/lib/prefs";
import { EMPTY_PARAMS, useUrlState } from "@/lib/url";

interface Props {
  fixtures: FixtureSlim[];
  results: Result[];
  leagues: LeagueInfo[];
  today: string;
  favouritesOnly?: boolean;
  lookback?: boolean;
}

interface Row {
  id: string;
  league: string;
  date: string;
  time: string | null;
  home: string;
  away: string;
  lines: Lines;
  pick: Tip | null;
  odds: number | null;
  f?: FixtureSlim;
  score?: [number, number] | null;
  per?: PeriodScores;
  live?: LiveEvent;
  past?: boolean;
  source?: Result["source"];
}

const WEEK = "week";
const LIVE = "live";

export function MatchesBoard(props: Props) {
  return (
    <Suspense fallback={<Board {...props} sp={EMPTY_PARAMS} />}>
      <BoardWithUrl {...props} />
    </Suspense>
  );
}

function BoardWithUrl(props: Props) {
  return <Board {...props} sp={useSearchParams()} />;
}

function Board({ fixtures, results, leagues, today, favouritesOnly = false, lookback = false, sp }: Props & { sp: URLSearchParams | ReturnType<typeof useSearchParams> }) {
  const days = useMemo(() => [...new Set((lookback ? results : fixtures).map((f) => f.date))].sort(), [lookback, results, fixtures]);
  const defaultDay = lookback ? (days.at(-1) ?? WEEK) : favouritesOnly ? "all" : days.includes(today) ? today : (days[0] ?? "all");
  const { get, set } = useUrlState(sp, { day: defaultDay, m: "top", sort: "league", q: "" });
  const day = get("day");
  const tab = MARKET_TABS.find((t) => t.id === get("m")) ?? MARKET_TABS[0];
  const sort = get("sort");
  const q = get("q");
  const favMatches = useFavourites("matches");
  const favLeagues = useFavourites("leagues");
  const { byFixture } = useBasketballFeed();
  const liveIds = useMemo(() => new Set(fixtures.filter((f) => byFixture.get(f.id)?.state === "in").map((f) => f.id)), [fixtures, byFixture]);

  const byCode = useMemo(() => Object.fromEntries(leagues.map((l) => [l.code, l])), [leagues]);
  const rank = useMemo(() => Object.fromEntries(leagues.map((l, i) => [l.code, i])), [leagues]);

  const { rows, unpriced } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const src: Row[] = lookback
      ? results
        .filter((r) => day === WEEK || r.date === day)
        .map((r) => {
          const pick = tabPick(tab, r.p);
          return { ...r, pick, odds: pick && PRICED.has(pick.key) ? (r.odds[pick.key] ?? null) : null, past: true };
        })
      : fixtures
        .filter((f) => (day === LIVE ? liveIds.has(f.id) : day === "all" || f.date === day))
        .map((f) => {
          const pick = tabPick(tab, f.p);
          return { ...f, f, pick, odds: pick && PRICED.has(pick.key) ? (f.odds?.[pick.key] ?? null) : null, live: byFixture.get(f.id) };
        });
    let unpriced = 0;
    const out = src.filter((r) => {
      const l = byCode[r.league];
      if (needle && !`${r.home} ${r.away} ${l?.name} ${l?.country}`.toLowerCase().includes(needle)) return false;
      if (favouritesOnly && !favMatches.has(r.id) && !favLeagues.has(r.league)) return false;
      if (!r.pick) unpriced++;
      return r.pick != null;
    });
    const tip = (r: Row) => `${r.date} ${r.time ?? "99:99"}`;
    out.sort((a, b) =>
      sort === "prob" ? b.pick!.p - a.pick!.p
        : sort === "time" ? tip(a).localeCompare(tip(b))
          : (rank[a.league] - rank[b.league]) || tip(a).localeCompare(tip(b)),
    );
    return { rows: out, unpriced };
  }, [lookback, results, fixtures, day, tab, q, sort, favouritesOnly, favMatches, favLeagues, byCode, rank, liveIds, byFixture]);

  const groups = useMemo(() => {
    if (sort !== "league") return [{ league: null as string | null, rows }];
    const m = new Map<string, Row[]>();
    for (const r of rows) m.set(r.league, [...(m.get(r.league) ?? []), r]);
    return [...m.entries()].map(([league, rows]) => ({ league: league as string | null, rows }));
  }, [rows, sort]);

  const tally = useMemo(() => {
    const t = { won: 0, settled: 0, pending: 0, backtest: false };
    if (!lookback) return t;
    for (const r of rows) {
      if (r.source === "backtest") t.backtest = true;
      if (!r.score) {
        t.pending++;
        continue;
      }
      const won = settle(r.pick!.key, r.score, r.lines, r.per);
      if (won !== null) t.settled++;
      if (won) t.won++;
    }
    return t;
  }, [lookback, rows]);

  return (
    <div className="space-y-4">
      <div className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1 shadow-card" data-tour="days">
          {(liveIds.size > 0 || day === LIVE) && (
            <DayButton active={day === LIVE} onClick={() => set({ day: LIVE })} top="Live" bottom={`${liveIds.size} on`} live />
          )}
          {!lookback && !favouritesOnly && results.length > 0 && (
            <Link href="/basketball/lookback" className="flex min-w-16 flex-col items-center rounded-lg px-3 py-1.5 text-ink-2 transition-colors hover:bg-surface-2">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold"><CalendarClock size={13} />Lookback</span>
              <span className="font-mono text-[10px] text-ink-3 uppercase">past 7 days</span>
            </Link>
          )}
          {lookback && <DayButton active={day === WEEK} onClick={() => set({ day: WEEK })} top="Week" bottom={`${days.length} days`} />}
          {favouritesOnly && <DayButton active={day === "all"} onClick={() => set({ day: "all" })} top="All" bottom="days" />}
          {days.map((d) => (
            <DayButton
              key={d}
              active={day === d}
              onClick={() => set({ day: d })}
              top={d === today ? "Today" : d === addDays(today, 1) ? "Tmrw" : d === addDays(today, -1) ? "Yday" : formatDay(d).split(" ")[0]}
              bottom={shortDate(d)}
            />
          ))}
        </div>
      </div>

      <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" data-tour="markets">
        {MARKET_TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => set({ m: t.id })} className={chip(t.id === tab.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input
            value={q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Filter by team, league or country"
            aria-label="Filter games"
            className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm placeholder:text-ink-3 hover:border-line-strong focus:border-accent focus:outline-none"
          />
        </div>
        <div role="radiogroup" aria-label="Sort" data-tour="sort" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {[["league", "League"], ["time", "Tip-off"], ["prob", "Probability"]].map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={sort === k}
              onClick={() => set({ sort: k })}
              className={cx("h-8 rounded-md px-2.5 text-[13px] font-medium", sort === k ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-ink-3">
        <span>
          {rows.length} {rows.length === 1 ? "game" : "games"}
          {unpriced > 0 && ` · ${unpriced} without data for this market`}
        </span>
        {lookback && rows.length > 0 && (
          <span>
            {tally.settled > 0 && (
              <>
                Picks won <span className="font-semibold text-ink tabular">{tally.won}/{tally.settled}</span> ({pct(tally.won / tally.settled)})
              </>
            )}
            {tally.pending > 0 && `${tally.settled > 0 ? " · " : ""}${tally.pending} awaiting result`}
            {tally.backtest && " · includes walk-forward backtest"}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        favouritesOnly ? (
          <EmptyState title="No favourites here yet">
            Tap the <Star size={13} className="inline -translate-y-px" /> on any game or league to keep it here. Favourites are saved in this browser.
          </EmptyState>
        ) : lookback ? (
          <EmptyState title="Nothing to look back on">Predictions show up here the day after tip-off, with results as they come in.</EmptyState>
        ) : day === LIVE ? (
          <EmptyState title="No games in play">Live games appear here as they tip off. Scores refresh every 30 seconds.</EmptyState>
        ) : (
          <EmptyState title="No games found">Try another day or market, or clear the filter. Out of season, a league has no fixtures.</EmptyState>
        )
      ) : (
        <div className="space-y-3">
          {groups.map((g, gi) => {
            const l = g.league ? byCode[g.league] : null;
            return (
              <section key={g.league ?? "all"} className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                <div className="flex items-center gap-1 border-b border-line bg-surface-2/60 py-1 pr-3 pl-1">
                  {l ? (
                    <>
                      <StarButton id={l.code} kind="leagues" label={l.name} />
                      <Link href={`/basketball/leagues/${l.code}`} className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold hover:text-accent-text">
                        <CountryTag country={l.country} />
                        <span className="truncate">
                          <span className="hidden font-normal text-ink-3 sm:inline">{l.country} · </span>
                          {l.name}
                          <span className="ml-1.5 font-mono text-[10px] font-normal text-ink-3">{l.tz}</span>
                        </span>
                      </Link>
                    </>
                  ) : (
                    <span className="flex-1 pl-3 text-sm font-semibold">{sort === "prob" ? "Most likely first" : "By tip-off"}</span>
                  )}
                  <ColumnLabels show={gi === 0} />
                </div>
                <ul>
                  {g.rows.map((r) => (
                    <GameRow key={r.id} r={r} today={today} showLeague={!l} league={byCode[r.league]} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DayButton({ active, onClick, top, bottom, live = false }: { active: boolean; onClick: () => void; top: string; bottom: string; live?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx("flex min-w-16 flex-col items-center rounded-lg px-3 py-1.5 transition-colors", active ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2")}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-semibold">{live && <LiveDot />}{top}</span>
      <span className={cx("font-mono text-[10px] uppercase", active ? "opacity-70" : "text-ink-3")}>{bottom}</span>
    </button>
  );
}

const COLS = "grid grid-cols-[3.25rem_5rem_3.25rem] sm:grid-cols-[4rem_7.5rem_4rem]";

function ColumnLabels({ show }: { show: boolean }) {
  return (
    <div className={cx(COLS, "shrink-0 gap-1 text-center text-[10px] font-medium tracking-wider text-ink-3 uppercase", !show && "invisible")} aria-hidden>
      <span>Prob</span>
      <span>Pick</span>
      <span>Odds</span>
    </div>
  );
}

function GameRow({ r, today, showLeague, league }: { r: Row; today: string; showLeague: boolean; league?: LeagueInfo }) {
  const [market, pick] = pickText(r.pick!.key, r.lines);
  const live = r.live && r.live.state !== "pre" ? r.live : undefined;
  const score = r.score ?? live?.score;
  const won = r.score ? settle(r.pick!.key, r.score, r.lines, r.per) : live ? liveSettle(r.pick!.key, live, r.lines) : undefined;
  const now = live?.state === "in" && r.f ? liveState(r.f, live).p[r.pick!.key] : undefined;
  return (
    <li className="border-b border-line last:border-0">
      <Link href={r.past ? `/basketball/leagues/${r.league}` : `/basketball/match/${r.id}`} data-tour={r.past ? undefined : "match"} className="flex items-center gap-1 py-2 pr-3 pl-1 transition-colors hover:bg-surface-2/70">
        <div className="flex w-12 shrink-0 flex-col items-center sm:w-14">
          {!r.past && <StarButton id={r.id} label={`${r.away} at ${r.home}`} />}
          {live && !r.past ? (
            <GameStatus e={live} className="-mt-1" stacked />
          ) : (
            <span className={cx("font-mono text-[11px] tabular", r.past ? "text-ink-2" : "-mt-1 text-ink-3")} title={r.past && !r.score ? "Awaiting result" : undefined}>
              {r.past ? (r.score ? "Final" : (r.time ?? "–")) : r.date === today || !r.date ? (r.time ?? "–") : shortDate(r.date)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          {showLeague && league && <div className="mb-0.5 truncate text-[11px] text-ink-3">{league.country} · {league.name}</div>}
          <TeamLine name={r.home} pts={score?.[0] ?? (r.past ? "–" : undefined)} live={live?.state === "in"} lead={!!score && score[0] > score[1]} />
          <TeamLine name={r.away} pts={score?.[1] ?? (r.past ? "–" : undefined)} live={live?.state === "in"} lead={!!score && score[1] > score[0]} />
        </div>
        <div className={cx(COLS, "shrink-0 items-center gap-1 text-center")}>
          <span title={now != null ? `In play ${Math.round(now * 100)}% · pre-game ${Math.round(r.pick!.p * 100)}%` : undefined}>
            <ProbPill p={now ?? r.pick!.p} size="sm" />
          </span>
          <span className="flex min-w-0 flex-col items-center leading-tight">
            <span className="max-w-full truncate text-[10px] text-ink-3">{market}</span>
            <span className="flex items-center gap-1 text-[13px] font-semibold whitespace-nowrap">
              {pick}
              {won !== undefined && <ResultMark won={won} />}
            </span>
          </span>
          <span className="text-[13px]"><Odds odds={r.odds} p={r.pick!.p} /></span>
        </div>
      </Link>
    </li>
  );
}

function TeamLine({ name, pts, live = false, lead = false }: { name: string; pts?: number | string; live?: boolean; lead?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[14px] leading-6">
      <span className={cx("truncate", lead ? "font-semibold" : "font-medium")}>{name}</span>
      {pts !== undefined && <span className={cx("font-mono text-[13px] font-semibold tabular", live && "text-bad", typeof pts === "string" && "text-ink-3")}>{pts}</span>}
    </div>
  );
}

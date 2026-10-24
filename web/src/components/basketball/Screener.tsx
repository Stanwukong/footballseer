"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";

import { WinBar } from "@/components/basketball/MarketsGrid";
import { Odds } from "@/components/client";
import { EdgeBadge, Meter } from "@/components/ui";
import { LABELS, marketName, PRICED } from "@/lib/basketball/format";
import type { FixtureSlim, LeagueInfo } from "@/lib/basketball/types";
import { fairOdds, formatDay, pct } from "@/lib/format";
import { EMPTY_PARAMS, useUrlState } from "@/lib/url";

const PRESETS: { label: string; params: Record<string, string> }[] = [
  { label: "Strong favourites", params: { market: "best", min: "75" } },
  { label: "Home covers", params: { market: "SP_H", min: "55" } },
  { label: "Shootouts", params: { market: "TO_O", min: "60" } },
  { label: "Grind-outs", params: { market: "TO_U", min: "60" } },
  { label: "Value bets", params: { value: "1", sort: "edge" } },
];

interface Row {
  f: FixtureSlim;
  key: string;
  p: number;
  odds: number | null;
  edge: number | null;
}

interface Props {
  fixtures: FixtureSlim[];
  leagues: LeagueInfo[];
  today: string;
  defaults?: Record<string, string>;
}

/** Filters live in the URL, so a screen can be bookmarked or shared. */
export function Screener(props: Props) {
  return (
    <Suspense fallback={<View {...props} sp={EMPTY_PARAMS} />}>
      <WithUrl {...props} />
    </Suspense>
  );
}

function WithUrl(props: Props) {
  return <View {...props} sp={useSearchParams()} />;
}

function View({ fixtures, leagues, today, defaults = {}, sp }: Props & { sp: URLSearchParams | ReturnType<typeof useSearchParams> }) {
  const { get, set } = useUrlState(sp, { market: "best", min: "0", league: "all", day: "all", value: "0", sort: "prob", q: "", ...defaults });
  const market = get("market");
  const minP = Number(get("min")) / 100;
  const league = get("league");
  const day = get("day");
  const valueOnly = get("value") === "1";
  const sort = get("sort");
  const q = get("q");
  const byCode = useMemo(() => Object.fromEntries(leagues.map((l) => [l.code, l])), [leagues]);
  const days = useMemo(() => [...new Set(fixtures.map((f) => f.date))].sort(), [fixtures]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out: Row[] = [];
    for (const f of fixtures) {
      if (league !== "all" && f.league !== league) continue;
      if (day !== "all" && f.date !== day) continue;
      if (needle && !`${f.home} ${f.away}`.toLowerCase().includes(needle)) continue;
      if (valueOnly && market === "best") {
        const b = f.value[0];
        if (b && b.p >= minP) out.push({ f, key: b.market, p: b.p, odds: b.odds, edge: b.edge });
        continue;
      }
      const key = market === "best" ? (f.p["1"] >= f.p["2"] ? "1" : "2") : market;
      const p = f.p[key];
      if (p == null || p < minP) continue;
      const odds = PRICED.has(key) ? (f.odds?.[key] ?? null) : null;
      if (valueOnly && !f.value.some((v) => v.market === key)) continue;
      out.push({ f, key, p, odds, edge: odds ? p * odds - 1 : null });
    }
    const tip = (r: Row) => `${r.f.date} ${r.f.time}`;
    return out.sort((a, b) => (sort === "time" ? tip(a).localeCompare(tip(b)) : sort === "edge" ? (b.edge ?? -9) - (a.edge ?? -9) : b.p - a.p));
  }, [fixtures, league, day, q, market, minP, valueOnly, sort]);

  const select = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm";

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {PRESETS.map((pr) => (
          <button
            key={pr.label}
            type="button"
            onClick={() => set({ market: null, min: null, value: null, sort: null, ...pr.params })}
            className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2 hover:border-accent hover:text-accent-text"
          >
            {pr.label}
          </button>
        ))}
        <button type="button" onClick={() => set({}, true)} className="px-2 py-1 text-xs text-ink-3 hover:text-ink">Reset</button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3">
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Market
          <select className={select} value={market} onChange={(e) => set({ market: e.target.value })}>
            <option value="best">Likelier winner</option>
            {Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          League
          <select className={select} value={league} onChange={(e) => set({ league: e.target.value })}>
            <option value="all">All leagues ({leagues.length})</option>
            {leagues.map((l) => <option key={l.code} value={l.code}>{l.country} · {l.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Day
          <select className={select} value={day} onChange={(e) => set({ day: e.target.value })}>
            <option value="all">Next {days.length} days</option>
            {days.map((d) => <option key={d} value={d}>{formatDay(d, today)}</option>)}
          </select>
        </label>
        <label className="flex min-w-40 flex-col gap-1 text-xs text-ink-3">
          Min probability: <span className="font-medium text-ink tabular">{Math.round(minP * 100)}%</span>
          <input type="range" min={0} max={95} step={5} value={Math.round(minP * 100)} onChange={(e) => set({ min: e.target.value })} className="accent-accent" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Sort
          <select className={select} value={sort} onChange={(e) => set({ sort: e.target.value })}>
            <option value="prob">Highest probability</option>
            <option value="edge">Biggest edge</option>
            <option value="time">Tip-off</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-sm text-ink-2">
          <input type="checkbox" checked={valueOnly} onChange={(e) => set({ value: e.target.checked ? "1" : null })} className="accent-accent" />
          Value only
        </label>
        <input placeholder="Search team…" value={q} onChange={(e) => set({ q: e.target.value })} className={`${select} ml-auto w-full sm:w-44`} />
      </div>

      <p className="mb-2 text-xs text-ink-3">{rows.length} of {fixtures.length} games</p>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-3">
          {valueOnly
            ? "No value bets right now. Value needs bookmaker odds, which ESPN publishes for the NBA, WNBA and major college games a day or two out."
            : "No games pass these filters. Try lowering the minimum probability."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-3">
              <tr>
                <th className="hidden px-3 py-2 font-normal sm:table-cell">Tip-off</th>
                <th className="px-3 py-2 font-normal">Game</th>
                <th className="hidden px-3 py-2 font-normal md:table-cell">Win split</th>
                <th className="px-3 py-2 font-normal">Pick</th>
                <th className="px-3 py-2 text-right font-normal">Prob.</th>
                <th className="hidden px-3 py-2 text-right font-normal sm:table-cell">Odds</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 300).map(({ f, key, p, odds, edge }) => (
                <tr key={f.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="hidden px-3 py-2.5 align-top text-xs whitespace-nowrap text-ink-2 sm:table-cell">
                    <div>{formatDay(f.date, today)}</div>
                    <div className="text-ink-3 tabular">{f.time} {byCode[f.league]?.tz}</div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <Link href={`/basketball/match/${f.id}`} className="font-medium hover:text-accent-text">{f.home} <span className="text-ink-3">v</span> {f.away}</Link>
                    <div className="text-xs text-ink-3">
                      {byCode[f.league]?.country} · {byCode[f.league]?.name}
                      <span className="tabular"> · {Math.round(f.pts[0])}–{Math.round(f.pts[1])} expected</span>
                    </div>
                  </td>
                  <td className="hidden w-40 px-3 py-2.5 align-middle md:table-cell"><WinBar p={f.p} home={f.home} away={f.away} /></td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="sm:whitespace-nowrap">{marketName(key, f.lines, f.home, f.away)}</div>
                    {edge != null && edge > 0.05 && <EdgeBadge edge={edge} />}
                  </td>
                  <td className="w-16 px-3 py-2.5 text-right align-top sm:w-28">
                    <div className="font-semibold tabular">{pct(p)}</div>
                    <Meter value={p} />
                  </td>
                  <td className="hidden px-3 py-2.5 text-right align-top tabular sm:table-cell">
                    <div><Odds odds={odds} /></div>
                    <div className="text-xs text-ink-3" title="Fair odds implied by the model">fair {fairOdds(p)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 300 && <p className="p-3 text-center text-xs text-ink-3">Showing first 300. Narrow the filters to see more.</p>}
        </div>
      )}
    </div>
  );
}

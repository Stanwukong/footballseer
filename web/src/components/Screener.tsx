"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";

import { EdgeBadge, Meter } from "@/components/ui";
import { ProbBar } from "@/components/ProbBar";
import { fairOdds, formatDay, LABELS, marketName, pct } from "@/lib/format";
import type { FixtureSlim } from "@/lib/types";

type LeagueInfo = { code: string; country: string; name: string; tier: number };

const ODDS_KEY: Record<string, string> = { "1": "1", X: "X", "2": "2", "O2.5": "O2.5", "U2.5": "U2.5" };
const PRESETS: { label: string; params: Record<string, string> }[] = [
  { label: "Banker home wins", params: { market: "1", min: "65" } },
  { label: "Goals galore", params: { market: "O2.5", min: "65" } },
  { label: "Both teams score", params: { market: "BTTS_Y", min: "60" } },
  { label: "Tight games", params: { market: "U2.5", min: "60" } },
  { label: "Value bets", params: { value: "1", sort: "edge" } },
];

interface Row {
  f: FixtureSlim;
  key: string;
  p: number;
  odds: number | null;
  edge: number | null;
}

interface ScreenerProps {
  fixtures: FixtureSlim[];
  leagues: LeagueInfo[];
  today: string;
  defaults?: Record<string, string>;
}

const EMPTY = new URLSearchParams();

/**
 * Filters live in the URL so a screen can be bookmarked or shared like a
 * saved strategy. The server prerenders the default view (as the Suspense
 * fallback); the URL-driven view takes over once the page hydrates.
 */
export function Screener(props: ScreenerProps) {
  return (
    <Suspense fallback={<ScreenerView {...props} sp={EMPTY} />}>
      <ScreenerWithUrl {...props} />
    </Suspense>
  );
}

function ScreenerWithUrl(props: ScreenerProps) {
  return <ScreenerView {...props} sp={useSearchParams()} />;
}

function ScreenerView({
  fixtures,
  leagues,
  today,
  defaults = {},
  sp,
}: ScreenerProps & { sp: URLSearchParams | ReturnType<typeof useSearchParams> }) {
  const router = useRouter();
  const pathname = usePathname();
  const get = (k: string, d: string) => sp.get(k) ?? defaults[k] ?? d;

  const market = get("market", "best");
  const minP = Number(get("min", "0")) / 100;
  const league = get("league", "all");
  const day = get("day", "all");
  const valueOnly = get("value", "0") === "1";
  const sort = get("sort", "prob");
  const q = get("q", "");

  const set = (patch: Record<string, string | null>, replaceAll = false) => {
    const next = new URLSearchParams(replaceAll ? "" : sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === defaults[k]) next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const byCode = useMemo(() => Object.fromEntries(leagues.map((l) => [l.code, l])), [leagues]);
  const countries = useMemo(() => {
    const m = new Map<string, LeagueInfo[]>();
    for (const l of leagues) m.set(l.country, [...(m.get(l.country) ?? []), l]);
    return [...m.entries()];
  }, [leagues]);
  const days = useMemo(() => [...new Set(fixtures.map((f) => f.date))].sort(), [fixtures]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out: Row[] = [];
    for (const f of fixtures) {
      if (league !== "all" && f.league !== league && byCode[f.league]?.country !== league) continue;
      if (day !== "all" && f.date !== day) continue;
      if (needle && !`${f.home} ${f.away}`.toLowerCase().includes(needle)) continue;

      let key = market;
      if (market === "best") key = (["1", "X", "2"] as const).reduce((a, b) => (f.p[b] > f.p[a] ? b : a));
      const p = f.p[key];
      if (p < minP) continue;

      const oddsKey = ODDS_KEY[key];
      const odds = oddsKey && f.odds?.[oddsKey] ? (f.odds[oddsKey] as number) : null;
      const vb = f.value.find((v) => v.market === key);
      const edge = odds ? p * odds - 1 : null;
      if (valueOnly) {
        if (market === "best" && f.value.length === 0) continue;
        if (market !== "best" && !vb) continue;
      }
      // In value mode with no market chosen, show the best-edge value bet.
      if (valueOnly && market === "best") {
        const b = f.value[0];
        out.push({ f, key: b.market, p: b.p, odds: b.odds, edge: b.edge });
      } else {
        out.push({ f, key, p, odds, edge });
      }
    }
    const kickoff = (r: Row) => `${r.f.date} ${r.f.time ?? "99:99"}`;
    out.sort((a, b) =>
      sort === "time" ? kickoff(a).localeCompare(kickoff(b))
        : sort === "edge" ? (b.edge ?? -9) - (a.edge ?? -9)
          : b.p - a.p,
    );
    return out;
  }, [fixtures, league, day, q, market, minP, valueOnly, sort, byCode]);

  const select = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm";

  return (
    <div>
      {/* Presets */}
      <div className="mb-3 flex flex-wrap gap-2">
        {PRESETS.map((pr) => (
          <button
            key={pr.label}
            onClick={() => set({ ...pr.params, league: league === "all" ? null : league, day: day === "all" ? null : day }, true)}
            className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2 hover:border-accent hover:text-accent-text"
          >
            {pr.label}
          </button>
        ))}
        <button onClick={() => set({}, true)} className="px-2 py-1 text-xs text-ink-3 hover:text-ink">Reset</button>
      </div>

      {/* Filters: one row above the results */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3">
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Market
          <select className={select} value={market} onChange={(e) => set({ market: e.target.value })}>
            <option value="best">Most likely result</option>
            {Object.entries(LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          League
          <select className={select} value={league} onChange={(e) => set({ league: e.target.value })}>
            <option value="all">All leagues ({leagues.length})</option>
            {countries.map(([country, ls]) => (
              <optgroup key={country} label={country}>
                {ls.length > 1 && <option value={country}>All {country}</option>}
                {ls.map((l) => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Day
          <select className={select} value={day} onChange={(e) => set({ day: e.target.value })}>
            <option value="all">Next {days.length} days</option>
            {days.map((d) => (
              <option key={d} value={d}>{formatDay(d, today)}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-40 flex-col gap-1 text-xs text-ink-3">
          Min probability: <span className="font-medium text-ink tabular">{Math.round(minP * 100)}%</span>
          <input type="range" min={0} max={95} step={5} value={Math.round(minP * 100)}
            onChange={(e) => set({ min: e.target.value === "0" ? null : e.target.value })} className="accent-accent" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Sort
          <select className={select} value={sort} onChange={(e) => set({ sort: e.target.value })}>
            <option value="prob">Highest probability</option>
            <option value="edge">Biggest edge</option>
            <option value="time">Kick-off</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-sm text-ink-2">
          <input type="checkbox" checked={valueOnly} onChange={(e) => set({ value: e.target.checked ? "1" : null })} className="accent-accent" />
          Value only
        </label>
        <input
          placeholder="Search team…"
          value={q}
          onChange={(e) => set({ q: e.target.value })}
          className={`${select} ml-auto w-full sm:w-44`}
        />
      </div>

      <p className="mb-2 text-xs text-ink-3">{rows.length} of {fixtures.length} matches</p>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-3">
          {valueOnly
            ? "No value bets right now. Value needs bookmaker odds, which are only published a few days before kick-off."
            : "No matches pass these filters. Try lowering the minimum probability."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-3">
              <tr>
                <th className="hidden px-3 py-2 font-normal sm:table-cell">Kick-off</th>
                <th className="px-3 py-2 font-normal">Match</th>
                <th className="hidden px-3 py-2 font-normal md:table-cell">Result split</th>
                <th className="px-3 py-2 font-normal">Pick</th>
                <th className="px-3 py-2 text-right font-normal">Prob.</th>
                <th className="hidden px-3 py-2 text-right font-normal sm:table-cell">Odds</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 300).map(({ f, key, p, odds, edge }) => (
                <tr key={f.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="hidden whitespace-nowrap px-3 py-2.5 align-top text-xs text-ink-2 sm:table-cell">
                    <div>{formatDay(f.date, today)}</div>
                    <div className="text-ink-3 tabular">{f.time ?? ""}</div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <Link href={`/match/${f.id}`} className="font-medium hover:text-accent-text">
                      {f.home} <span className="text-ink-3">v</span> {f.away}
                    </Link>
                    <div className="text-xs text-ink-3">
                      {byCode[f.league]?.country} · {byCode[f.league]?.name}
                      <span className="sm:hidden"> · {formatDay(f.date, today)} {f.time ?? ""}</span>
                      <span className="tabular"> · xG {f.xg[0].toFixed(1)}–{f.xg[1].toFixed(1)}</span>
                    </div>
                  </td>
                  <td className="hidden w-40 px-3 py-2.5 align-middle md:table-cell">
                    <ProbBar p={f.p} home={f.home} away={f.away} />
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="sm:whitespace-nowrap">{marketName(key, f.home, f.away)}</div>
                    {edge != null && edge > 0.05 && <EdgeBadge edge={edge} />}
                  </td>
                  <td className="w-16 px-3 py-2.5 text-right align-top sm:w-28">
                    <div className="font-semibold tabular">{pct(p)}</div>
                    <Meter value={p} />
                  </td>
                  <td className="hidden px-3 py-2.5 text-right align-top tabular sm:table-cell">
                    <div>{odds ? odds.toFixed(2) : "–"}</div>
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

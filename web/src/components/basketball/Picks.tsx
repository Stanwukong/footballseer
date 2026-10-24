"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Odds } from "@/components/client";
import { DayPicker, LeaguePicker, MarketChips, RangeInputs } from "@/components/Pickers";
import { button, Card, CountryTag, Field, ProbPill } from "@/components/ui";
import { LABELS, marketName, pickText } from "@/lib/basketball/format";
import { buildAcca, PICK_MARKETS, type Acca } from "@/lib/basketball/picks";
import type { FixtureSlim, LeagueInfo } from "@/lib/basketball/types";
import { formatDay, pct } from "@/lib/format";

/** An accumulator as a ticket: one row per leg, total odds and combined chance at the foot. */
export function AccaCard({ title, subtitle, acca, leagues, today }: { title: string; subtitle?: string; acca: Acca; leagues: Record<string, LeagueInfo>; today?: string }) {
  const fair = acca.legs.some((l) => l.fair);
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div>
          <h2 className="font-display text-base font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-ink-3">{subtitle}</p>}
        </div>
        <span className="eyebrow">{acca.legs.length} {acca.legs.length === 1 ? "leg" : "legs"}</span>
      </header>
      {acca.legs.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-3 sm:px-5">No games fit these criteria.</p>
      ) : (
        <ol className="divide-y divide-line">
          {acca.legs.map((c, i) => {
            const l = leagues[c.f.league];
            const [market, pick] = pickText(c.key, c.f.lines);
            return (
              <li key={c.f.id}>
                <Link href={`/basketball/match/${c.f.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/70 sm:px-5">
                  <span className="hidden w-5 font-mono text-[11px] text-ink-3 sm:block">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] text-ink-3">
                      {l && <CountryTag country={l.country} />}
                      <span className="truncate">{l?.name} · {formatDay(c.f.date, today)} {c.f.time} {l?.tz}</span>
                    </div>
                    <div className="mt-1 truncate text-sm font-medium">{c.f.home} <span className="text-ink-3">v</span> {c.f.away}</div>
                    <div className="mt-0.5 truncate text-xs text-ink-2" title={marketName(c.key, c.f.lines, c.f.home, c.f.away)}>
                      {market} <span className="font-semibold text-ink">{pick}</span>
                    </div>
                  </div>
                  <ProbPill p={c.p} size="sm" />
                  <span className="w-12 text-right text-sm"><Odds odds={c.fair ? null : c.odds} p={c.p} /></span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      {acca.legs.length > 0 && (
        <footer className="flex items-center justify-between gap-3 border-t border-line bg-surface-2/60 px-4 py-3 sm:px-5">
          <span className="text-xs text-ink-3">All legs win: <span className="font-semibold text-ink tabular">{pct(acca.p, 1)}</span></span>
          <span className="text-sm">
            <span className="mr-2 text-xs text-ink-3">{fair ? "Fair odds" : "Total odds"}</span>
            <span className="font-display text-lg font-semibold"><Odds odds={acca.odds} /></span>
          </span>
        </footer>
      )}
    </section>
  );
}

const DEFAULTS = {
  keys: ["1", "2", "TO_O", "TO_U"],
  days: [] as string[],
  leagues: [] as string[],
  legs: 4,
  odds: [1.2, 2] as [number, number],
  prob: [55, 100] as [number, number],
};

/** Choose markets, days, leagues, the number of games and odds/probability bands; get the likeliest accumulator that fits. */
export function Generator({ fixtures, leagues, today }: { fixtures: FixtureSlim[]; leagues: LeagueInfo[]; today: string }) {
  const [s, setS] = useState(DEFAULTS);
  const set = (patch: Partial<typeof DEFAULTS>) => setS((x) => ({ ...x, ...patch }));
  const days = useMemo(() => [...new Set(fixtures.map((f) => f.date))].sort(), [fixtures]);
  const byCode = useMemo(() => Object.fromEntries(leagues.map((l) => [l.code, l])), [leagues]);
  const acca = useMemo(() => {
    const pool = fixtures.filter((f) => (!s.days.length || s.days.includes(f.date)) && (!s.leagues.length || s.leagues.includes(f.league)));
    return buildAcca(pool, { legs: s.legs, keys: s.keys.length ? s.keys : PICK_MARKETS, minOdds: s.odds[0], maxOdds: s.odds[1], minP: s.prob[0] / 100, maxP: s.prob[1] / 100 });
  }, [fixtures, s]);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card title="Criteria" className="lg:col-span-2" action={<button type="button" className={button("ghost")} onClick={() => setS(DEFAULTS)}><RotateCcw size={14} /> Reset</button>}>
        <div className="space-y-5">
          <Field label="Markets">
            <MarketChips options={PICK_MARKETS.map((k) => ({ key: k, label: LABELS[k] ?? k }))} value={s.keys} onChange={(keys) => set({ keys })} />
          </Field>
          <Field label="Days">
            <DayPicker days={days} value={s.days} onChange={(d) => set({ days: d })} today={today} />
          </Field>
          <Field label="Leagues">
            <LeaguePicker leagues={leagues} value={s.leagues} onChange={(l) => set({ leagues: l })} />
          </Field>
          <Field label={<>Number of games: <span className="text-ink tabular">{s.legs}</span></>}>
            <input type="range" min={1} max={12} value={s.legs} onChange={(e) => set({ legs: Number(e.target.value) })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field label="Odds per pick">
              <RangeInputs min={1.01} max={20} step={0.05} value={s.odds} onChange={(odds) => set({ odds })} />
            </Field>
            <Field label="Probability per pick">
              <RangeInputs min={1} max={100} step={1} value={s.prob} onChange={(prob) => set({ prob })} suffix="%" />
            </Field>
          </div>
        </div>
      </Card>
      <div className="lg:col-span-3">
        <AccaCard
          title="Your accumulator"
          subtitle={acca.legs.length < s.legs ? `Only ${acca.legs.length} of ${s.legs} games fit. Widen the odds or probability bands.` : "Likeliest pick per game within your bands"}
          acca={acca}
          leagues={byCode}
          today={today}
        />
        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          Moneyline, spread and totals use the bookmaker&apos;s price where ESPN publishes one; other picks use the model&apos;s fair odds
          (1 ÷ probability), which real books undercut.
        </p>
      </div>
    </div>
  );
}

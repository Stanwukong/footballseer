"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DayPicker, LeaguePicker, MarketChips } from "@/components/Pickers";
import { Segmented } from "@/components/TeamTables";
import { Card, CountryTag, EmptyState, Field } from "@/components/ui";
import { formatDay, TREND_EVENTS, trendText } from "@/lib/format";
import type { LeagueInfo, Trend } from "@/lib/types";

export interface TrendItem extends Trend {
  team: string;
  side: "home" | "away";
  fixture: { id: string; league: string; date: string; time: string | null; home: string; away: string };
}

/** Streaks for teams playing in the next few days, longest first or grouped by match. */
export function TrendsBoard({ items, leagues, today }: { items: TrendItem[]; leagues: LeagueInfo[]; today: string }) {
  const [events, setEvents] = useState<string[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [lgs, setLgs] = useState<string[]>([]);
  const [min, setMin] = useState(5);
  const [view, setView] = useState<"top" | "match">("top");
  const byCode = useMemo(() => Object.fromEntries(leagues.map((l) => [l.code, l])), [leagues]);
  const allDays = useMemo(() => [...new Set(items.map((t) => t.fixture.date))].sort(), [items]);

  const shown = useMemo(
    () =>
      items
        .filter((t) => t.n >= min && (!events.length || events.includes(t.e)) && (!days.length || days.includes(t.fixture.date)) && (!lgs.length || lgs.includes(t.fixture.league)))
        .sort((a, b) => b.n - a.n),
    [items, min, events, days, lgs],
  );
  const grouped = useMemo(() => {
    const m = new Map<string, TrendItem[]>();
    for (const t of shown) m.set(t.fixture.id, [...(m.get(t.fixture.id) ?? []), t]);
    return [...m.values()].sort((a, b) => `${a[0].fixture.date}${a[0].fixture.time}`.localeCompare(`${b[0].fixture.date}${b[0].fixture.time}`));
  }, [shown]);

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      <Card title="Filter" className="h-fit lg:sticky lg:top-20">
        <div className="space-y-5">
          <Field label="Events">
            <MarketChips options={TREND_EVENTS} value={events} onChange={setEvents} />
          </Field>
          <Field label="Days">
            <DayPicker days={allDays} value={days} onChange={setDays} today={today} />
          </Field>
          <Field label="Leagues">
            <LeaguePicker leagues={leagues} value={lgs} onChange={setLgs} />
          </Field>
          <Field label={<>Minimum run: <span className="text-ink tabular">{min} matches</span></>}>
            <input type="range" min={4} max={15} value={min} onChange={(e) => setMin(Number(e.target.value))} />
          </Field>
        </div>
      </Card>
      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Segmented label="View" value={view} onChange={setView} options={[{ id: "top", label: "Top trends" }, { id: "match", label: "By match" }]} />
          <span className="text-sm text-ink-3 tabular">{shown.length} trends</span>
        </div>
        {shown.length === 0 ? (
          <EmptyState title="No trends match">Lower the minimum run or pick other events.</EmptyState>
        ) : view === "top" ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {shown.slice(0, 120).map((t, i) => (
              <li key={i}>
                <Link href={`/match/${t.fixture.id}`} className="flex h-full gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-card transition-colors hover:border-line-strong">
                  <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-accent-soft text-center leading-none text-accent-text">
                    <span className="font-display text-lg font-semibold tabular">{t.n}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                      <CountryTag country={byCode[t.fixture.league]?.country ?? ""} />
                      <span className="truncate">{formatDay(t.fixture.date, today)} {t.fixture.time ?? ""}</span>
                    </span>
                    <span className="mt-1 block truncate text-sm font-semibold">{t.team}</span>
                    <span className="block text-sm text-ink-2">{trendText(t)}</span>
                    <span className="mt-1 block truncate text-xs text-ink-3">{t.fixture.home} v {t.fixture.away}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            {grouped.map((g) => {
              const f = g[0].fixture;
              return (
                <section key={f.id} className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                  <Link href={`/match/${f.id}`} className="flex items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-2.5 hover:text-accent-text">
                    <CountryTag country={byCode[f.league]?.country ?? ""} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.home} v {f.away}</span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-3">{formatDay(f.date, today)} {f.time ?? ""}</span>
                  </Link>
                  <ul className="divide-y divide-line">
                    {g.map((t, i) => (
                      <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <span className="w-8 shrink-0 font-display font-semibold text-accent-text tabular">{t.n}</span>
                        <span className="w-32 shrink-0 truncate font-medium sm:w-40">{t.team}</span>
                        <span className="min-w-0 flex-1 text-ink-2">{trendText(t)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { LeaguePicker } from "@/components/Pickers";
import { Segmented } from "@/components/TeamTables";
import { Card, chip, cx, EmptyState, Field } from "@/components/ui";
import { EVENTS, teamRate } from "@/lib/events";
import { formatDay } from "@/lib/format";
import type { LeagueInfo, Rate } from "@/lib/types";

export interface TeamRow {
  team: string;
  league: string;
  rates: { l10: Rate; all: Rate; home: Rate; away: Rate };
  next?: { id: string; date: string; time: string | null; home: string; away: string };
}

const TEAM_EVENTS = [
  ...EVENTS.filter((e) => !["1", "2"].includes(e.key)).map((e) => ({ key: e.key, label: e.label, counter: e.home, ht: e.ht })),
  { key: "W", label: "Wins", counter: "W", ht: false },
  { key: "L", label: "Defeats", counter: "L", ht: false },
  { key: "CS", label: "Clean sheets", counter: "CS", ht: false },
  { key: "FTS", label: "Failed to score", counter: "FTS", ht: false },
];

/** Which teams hit an event most often (BetMines' advanced team stats). */
export function TeamStatsBoard({ rows, leagues, today }: { rows: TeamRow[]; leagues: LeagueInfo[]; today: string }) {
  const [event, setEvent] = useState("O2.5");
  const [sample, setSample] = useState<"l10" | "all" | "home" | "away">("l10");
  const [lgs, setLgs] = useState<string[]>([]);
  const [upcoming, setUpcoming] = useState(true);
  const [minN, setMinN] = useState(5);
  const [sort, setSort] = useState<"rate" | "hits">("rate");
  const byCode = useMemo(() => Object.fromEntries(leagues.map((l) => [l.code, l])), [leagues]);
  const ev = TEAM_EVENTS.find((e) => e.key === event)!;

  const list = useMemo(() => {
    const out = [];
    for (const r of rows) {
      if (upcoming && !r.next) continue;
      if (lgs.length && !lgs.includes(r.league)) continue;
      const x = teamRate(r.rates[sample], ev.counter, ev.ht);
      if (!x || x.n < minN) continue;
      out.push({ r, ...x });
    }
    return out.sort((a, b) => (sort === "rate" ? b.rate - a.rate || b.hits - a.hits : b.hits - a.hits || b.rate - a.rate));
  }, [rows, upcoming, lgs, sample, ev, minN, sort]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-4">
          <Field label="Event">
            <div className="flex flex-wrap gap-1.5">
              {TEAM_EVENTS.map((e) => (
                <button key={e.key} type="button" className={cx(chip(event === e.key), "py-1 text-xs")} onClick={() => setEvent(e.key)}>{e.label}</button>
              ))}
            </div>
          </Field>
          <div className="grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-end">
            <Field label="Sample">
              <Segmented label="Sample" value={sample} onChange={setSample} options={[{ id: "l10", label: "Last 10" }, { id: "all", label: "Season" }, { id: "home", label: "Home" }, { id: "away", label: "Away" }]} />
            </Field>
            <Field label="Leagues">
              <LeaguePicker leagues={leagues} value={lgs} onChange={setLgs} />
            </Field>
            <Field label={<>Min. matches: <span className="text-ink tabular">{minN}</span></>}>
              <input type="range" min={1} max={10} value={minN} onChange={(e) => setMinN(Number(e.target.value))} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={upcoming} onChange={(e) => setUpcoming(e.target.checked)} /> Only teams with an upcoming match</label>
            <Segmented label="Sort" value={sort} onChange={setSort} options={[{ id: "rate", label: "Hit rate" }, { id: "hits", label: "Hits" }]} />
          </div>
        </div>
      </Card>

      {list.length === 0 ? (
        <EmptyState title="No teams match">Lower the minimum matches or include teams without fixtures.</EmptyState>
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
                  <Link href={`/match/${r.next.id}`} className="hidden min-w-0 flex-1 text-right text-xs text-ink-2 hover:text-accent-text md:block">
                    <span className="block truncate">{r.next.home} v {r.next.away}</span>
                    <span className="block font-mono text-[11px] text-ink-3">{formatDay(r.next.date, today)} {r.next.time ?? ""}</span>
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

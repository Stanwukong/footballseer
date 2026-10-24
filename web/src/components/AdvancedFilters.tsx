"use client";

import { RotateCcw, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Odds } from "@/components/client";
import { DayPicker, LeaguePicker, RangeInputs } from "@/components/Pickers";
import { button, Card, chip, cx, EmptyState, Field, input, ProbPill } from "@/components/ui";
import { EVENTS, EVENT_BY_KEY, h2hRate, teamRate } from "@/lib/events";
import { formatDay, ODDS_KEY, pct, prob } from "@/lib/format";
import { useJsonPref } from "@/lib/prefs";
import type { FixtureSlim, H2H, LeagueInfo, Rate } from "@/lib/types";

export interface FilterRow {
  f: FixtureSlim;
  h2h: H2H[];
  home?: { l10: Rate; venue: Rate; all: Rate; avg5: [number, number] };
  away?: { l10: Rate; venue: Rate; all: Rate; avg5: [number, number] };
}

const DEFAULTS = {
  event: "O2.5",
  days: [] as string[],
  leagues: [] as string[],
  l10: [0, 0] as [number, number],
  venue: [0, 0] as [number, number],
  all: [0, 0] as [number, number],
  h2h: 0,
  scored: [0, 0] as [number, number],
  conceded: [0, 0] as [number, number],
  odds: [1, 20] as [number, number],
  prob: [0, 100] as [number, number],
};
type Criteria = typeof DEFAULTS;

const PRESETS: { name: string; c: Partial<Criteria> }[] = [
  { name: "Goals galore", c: { event: "O2.5", l10: [70, 70], venue: [60, 60], prob: [55, 100] } },
  { name: "Both score", c: { event: "BTTS_Y", l10: [60, 60], scored: [1.2, 1.2] } },
  { name: "Tight game", c: { event: "U2.5", l10: [60, 60], venue: [60, 60] } },
  { name: "Home banker", c: { event: "1", venue: [70, 0], all: [0, 0], prob: [60, 100] } },
];

/** BetMines' statistical filter: find matches where both teams' records back an event. */
export function AdvancedFilters({ rows, leagues, today }: { rows: FilterRow[]; leagues: LeagueInfo[]; today: string }) {
  const [c, setC] = useState<Criteria>(DEFAULTS);
  const [saved, setSaved] = useJsonPref<{ name: string; c: Criteria }[]>("fs-saved-filters", []);
  const [name, setName] = useState("");
  const set = (patch: Partial<Criteria>) => setC((x) => ({ ...x, ...patch }));
  const e = EVENT_BY_KEY[c.event];
  const days = useMemo(() => [...new Set(rows.map((r) => r.f.date))].sort(), [rows]);
  const byCode = useMemo(() => Object.fromEntries(leagues.map((l) => [l.code, l])), [leagues]);

  const results = useMemo(() => {
    const out = [];
    for (const r of rows) {
      const { f } = r;
      if (c.days.length && !c.days.includes(f.date)) continue;
      if (c.leagues.length && !c.leagues.includes(f.league)) continue;
      if (!r.home || !r.away) continue;
      const hl10 = teamRate(r.home.l10, e.home, e.ht), al10 = teamRate(r.away.l10, e.away, e.ht);
      const hv = teamRate(r.home.venue, e.home, e.ht), av = teamRate(r.away.venue, e.away, e.ht);
      const ha = teamRate(r.home.all, e.home, e.ht), aa = teamRate(r.away.all, e.away, e.ht);
      const min = (x: { rate: number } | null, m: number) => m <= 0 || (x != null && x.rate * 100 >= m);
      if (!min(hl10, c.l10[0]) || !min(al10, c.l10[1])) continue;
      if (!min(hv, c.venue[0]) || !min(av, c.venue[1])) continue;
      if (!min(ha, c.all[0]) || !min(aa, c.all[1])) continue;
      const h2h = h2hRate(r.h2h, f.home, e);
      if (c.h2h > 0 && (!h2h || h2h.n < 3 || h2h.rate * 100 < c.h2h)) continue;
      if (r.home.avg5[0] < c.scored[0] || r.away.avg5[0] < c.scored[1]) continue;
      if (r.home.avg5[1] < c.conceded[0] || r.away.avg5[1] < c.conceded[1]) continue;
      const p = prob(f.p, e.market);
      if (p == null || p * 100 < c.prob[0] || p * 100 > c.prob[1]) continue;
      const ok = ODDS_KEY[e.market];
      const odds = (ok && f.odds?.[ok]) || 1 / p;
      if (odds < c.odds[0] || odds > c.odds[1]) continue;
      out.push({ r, p, hl10, al10, hv, av, h2h, book: ok ? (f.odds?.[ok] ?? null) : null });
    }
    return out.sort((a, b) => b.p - a.p);
  }, [rows, c, e]);

  const pair = (label: string, k: "l10" | "venue" | "all", hint: string) => (
    <Field label={label}>
      <div className="grid grid-cols-2 gap-2">
        <PctInput label="Home team" value={c[k][0]} onChange={(v) => set({ [k]: [v, c[k][1]] })} />
        <PctInput label="Away team" value={c[k][1]} onChange={(v) => set({ [k]: [c[k][0], v] })} />
      </div>
      <span className="text-[11px] text-ink-3">{hint}</span>
    </Field>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
      <div className="space-y-4">
        <Card title="Event" action={<button type="button" className={button("ghost")} onClick={() => setC(DEFAULTS)}><RotateCcw size={14} /> Reset</button>}>
          <div className="flex flex-wrap gap-1.5">
            {EVENTS.map((x) => (
              <button key={x.key} type="button" className={cx(chip(c.event === x.key), "py-1 text-xs")} onClick={() => set({ event: x.key })}>{x.label}</button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
            <span className="eyebrow mr-1">Presets</span>
            {PRESETS.map((p) => (
              <button key={p.name} type="button" className="rounded-md px-2 py-1 text-xs text-accent-text hover:bg-accent-soft" onClick={() => setC({ ...DEFAULTS, ...p.c })}>{p.name}</button>
            ))}
          </div>
        </Card>
        <Card title="Dates and leagues">
          <div className="space-y-4">
            <DayPicker days={days} value={c.days} onChange={(d) => set({ days: d })} today={today} />
            <LeaguePicker leagues={leagues} value={c.leagues} onChange={(l) => set({ leagues: l })} />
          </div>
        </Card>
        <Card title="Statistics" hint="Minimum share of matches with the event. 0 switches a filter off.">
          <div className="space-y-4">
            {pair("Last 10 matches", "l10", "Each team's last 10 league matches")}
            {pair("Home at home, away away", "venue", "This season, at the venue of this match")}
            {pair("All league matches", "all", "This season, home and away")}
            <Field label="Head to head">
              <PctInput label="Recent meetings (needs 3+)" value={c.h2h} onChange={(v) => set({ h2h: v })} />
            </Field>
            <Field label="Avg goals scored, last 5 (at least)">
              <div className="grid grid-cols-2 gap-2">
                <NumInput label="Home team" value={c.scored[0]} onChange={(v) => set({ scored: [v, c.scored[1]] })} />
                <NumInput label="Away team" value={c.scored[1]} onChange={(v) => set({ scored: [c.scored[0], v] })} />
              </div>
            </Field>
            <Field label="Avg goals conceded, last 5 (at least)">
              <div className="grid grid-cols-2 gap-2">
                <NumInput label="Home team" value={c.conceded[0]} onChange={(v) => set({ conceded: [v, c.conceded[1]] })} />
                <NumInput label="Away team" value={c.conceded[1]} onChange={(v) => set({ conceded: [c.conceded[0], v] })} />
              </div>
            </Field>
            <Field label="Odds">
              <RangeInputs min={1} max={50} step={0.05} value={c.odds} onChange={(odds) => set({ odds })} />
            </Field>
            <Field label="Model probability">
              <RangeInputs min={0} max={100} step={1} value={c.prob} onChange={(p) => set({ prob: p })} suffix="%" />
            </Field>
          </div>
        </Card>
        <Card title="Saved searches" hint="Kept in this browser">
          <form
            className="flex gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!name.trim()) return;
              setSaved([...saved.filter((s) => s.name !== name.trim()), { name: name.trim(), c }]);
              setName("");
            }}
          >
            <input className={cx(input, "min-w-0 flex-1")} placeholder="Name this search" value={name} onChange={(ev) => setName(ev.target.value)} />
            <button type="submit" className={button("secondary")}><Save size={14} /> Save</button>
          </form>
          {saved.length > 0 && (
            <ul className="mt-3 divide-y divide-line">
              {saved.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <button type="button" className="min-w-0 truncate text-left hover:text-accent-text" onClick={() => setC({ ...DEFAULTS, ...s.c })}>
                    {s.name} <span className="text-xs text-ink-3">· {EVENT_BY_KEY[s.c.event]?.label}</span>
                  </button>
                  <button type="button" aria-label={`Delete ${s.name}`} className="text-ink-3 hover:text-bad" onClick={() => setSaved(saved.filter((x) => x.name !== s.name))}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold">{e.label}</h2>
          <span className="text-sm text-ink-3 tabular">{results.length} of {rows.length} matches</span>
        </div>
        {results.length === 0 ? (
          <EmptyState title="No matches pass these filters">Lower a minimum or widen the odds and probability bands.</EmptyState>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm tabular">
                <thead className="text-[11px] tracking-wider text-ink-3 uppercase">
                  <tr className="border-b border-line">
                    <th className="py-2.5 pl-4 text-left font-medium">Match</th>
                    <th className="py-2.5 text-center font-medium" title="Model probability">Model</th>
                    <th className="py-2.5 text-center font-medium" title="Last 10: home team / away team">Last 10</th>
                    <th className="py-2.5 text-center font-medium" title="Home team at home / away team away">Venue</th>
                    <th className="py-2.5 text-center font-medium">H2H</th>
                    <th className="py-2.5 pr-4 text-right font-medium">Odds</th>
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 100).map(({ r, p, hl10, al10, hv, av, h2h, book }) => (
                    <tr key={r.f.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                      <td className="py-2.5 pl-4">
                        <Link href={`/match/${r.f.id}`} className="font-medium hover:text-accent-text">{r.f.home} <span className="text-ink-3">v</span> {r.f.away}</Link>
                        <div className="text-xs text-ink-3">{byCode[r.f.league]?.country} · {byCode[r.f.league]?.name} · {formatDay(r.f.date, today)} {r.f.time ?? ""}</div>
                      </td>
                      <td className="py-2.5 text-center"><ProbPill p={p} size="sm" /></td>
                      <td className="py-2.5 text-center text-xs">{pct(hl10?.rate)} / {pct(al10?.rate)}</td>
                      <td className="py-2.5 text-center text-xs">{pct(hv?.rate)} / {pct(av?.rate)}</td>
                      <td className="py-2.5 text-center text-xs">{h2h ? `${h2h.hits}/${h2h.n}` : "–"}</td>
                      <td className="py-2.5 pr-4 text-right"><Odds odds={book} p={p} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {results.length > 100 && <p className="border-t border-line p-3 text-center text-xs text-ink-3">Showing the 100 likeliest. Tighten the filters to narrow the list.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function PctInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-ink-3">{label}</span>
      <span className="relative">
        <input type="number" min={0} max={100} step={5} value={value} onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value))))} className={cx(input, "w-full pr-7 tabular")} />
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-ink-3">%</span>
      </span>
    </label>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-ink-3">{label}</span>
      <input type="number" min={0} max={6} step={0.1} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} className={cx(input, "w-full tabular")} />
    </label>
  );
}

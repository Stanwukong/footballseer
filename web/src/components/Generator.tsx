"use client";

import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

import { AccaCard } from "@/components/AccaCard";
import { DayPicker, LeaguePicker, MarketChips, RangeInputs } from "@/components/Pickers";
import { button, Card, Field } from "@/components/ui";
import { LABELS } from "@/lib/format";
import { buildAcca, PICK_MARKETS } from "@/lib/picks";
import type { FixtureSlim, LeagueInfo } from "@/lib/types";

const DEFAULTS = {
  keys: ["O1.5", "1X", "X2", "BTTS_Y"],
  days: [] as string[],
  leagues: [] as string[],
  legs: 5,
  odds: [1.2, 2] as [number, number],
  prob: [55, 100] as [number, number],
};

/**
 * BetMines Machine: choose markets, days, leagues, the number of matches and
 * odds/probability bands, and get the likeliest accumulator that fits.
 */
export function Generator({ fixtures, leagues, today }: { fixtures: FixtureSlim[]; leagues: LeagueInfo[]; today: string }) {
  const [s, setS] = useState(DEFAULTS);
  const set = (patch: Partial<typeof DEFAULTS>) => setS((x) => ({ ...x, ...patch }));
  const days = useMemo(() => [...new Set(fixtures.map((f) => f.date))].sort(), [fixtures]);
  const byCode = useMemo(() => Object.fromEntries(leagues.map((l) => [l.code, l])), [leagues]);

  const acca = useMemo(() => {
    const pool = fixtures.filter((f) => (!s.days.length || s.days.includes(f.date)) && (!s.leagues.length || s.leagues.includes(f.league)));
    return buildAcca(pool, {
      legs: s.legs,
      keys: s.keys.length ? s.keys : PICK_MARKETS,
      minOdds: s.odds[0],
      maxOdds: s.odds[1],
      minP: s.prob[0] / 100,
      maxP: s.prob[1] / 100,
    });
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
          <Field label={<>Number of matches: <span className="text-ink tabular">{s.legs}</span></>}>
            <input type="range" min={1} max={20} value={s.legs} onChange={(e) => set({ legs: Number(e.target.value) })} />
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
          subtitle={acca.legs.length < s.legs ? `Only ${acca.legs.length} of ${s.legs} matches fit. Widen the odds or probability bands.` : "Likeliest pick per match within your bands"}
          acca={acca}
          leagues={byCode}
          today={today}
        />
        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          Without bookmaker odds the generator uses the model&apos;s fair odds (1 ÷ probability), so the total is what the
          accumulator would pay at a zero-margin price; real books pay less.
        </p>
      </div>
    </div>
  );
}

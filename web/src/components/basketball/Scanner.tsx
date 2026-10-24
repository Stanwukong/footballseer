"use client";

import { Download, Plus, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Odds } from "@/components/client";
import { LeaguePicker } from "@/components/Pickers";
import { Segmented } from "@/components/TeamTables";
import { button, Card, chip, cx, EmptyState, Field, input, ProbPill, Stat } from "@/components/ui";
import { LABELS, settle } from "@/lib/basketball/format";
import type { Backtest, FixtureSlim, LeagueInfo, Lines, PeriodScores } from "@/lib/basketball/types";
import { formatDay, pct, signedPct } from "@/lib/format";
import { useJsonPref } from "@/lib/prefs";

const OUTCOMES = [
  "1", "2", "SP_H", "SP_A", "TO_O", "TO_U", "HT_O", "AT_O", "WM_H6", "WM_A6", "WM_C5",
  ...["H1", "H2", "Q1", "Q2", "Q3", "Q4"].flatMap((p) => [`${p}_1`, `${p}_X`, `${p}_2`, `${p}_O`, `${p}_U`]),
  "HF_11", "HF_22", "HF_21", "HF_12",
];
/** Period unders aren't exported; they're the complement of the over. */
const COMPLEMENT: Record<string, string> = Object.fromEntries(["H1", "H2", "Q1", "Q2", "Q3", "Q4"].map((p) => [`${p}_U`, `${p}_O`]));
const SCORES = ["h1h", "h1a", "q1h", "q1a", "q2h", "q2a", "q3h", "q3a", "q4h", "q4a"];
/** Bookmaker price column for outcomes that can have one. ESPN keeps no historical odds, so these fill only from live predictions. */
const ODDS_COL: Record<string, string> = { "1": "odds_h", "2": "odds_a", SP_H: "odds_sph", SP_A: "odds_spa", TO_O: "odds_o", TO_U: "odds_u" };

const FIELDS: { key: string; label: string; kind: "prob" | "pts" | "odds" | "edge" }[] = [
  ...OUTCOMES.map((k) => ({ key: k, label: `P(${LABELS[k]})`, kind: "prob" as const })),
  { key: "margin", label: "Expected home margin", kind: "pts" },
  { key: "total", label: "Expected total points", kind: "pts" },
  { key: "odds_h", label: "Home moneyline odds", kind: "odds" },
  { key: "odds_a", label: "Away moneyline odds", kind: "odds" },
  { key: "edge", label: "Edge on outcome", kind: "edge" },
];
const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

interface Rule { field: string; op: ">=" | "<="; value: number }
interface Strategy { name: string; outcome: string; rules: Rule[]; leagues: string[] }

const SUGGESTED: Strategy[] = [
  { name: "Heavy home favourite", outcome: "1", rules: [{ field: "1", op: ">=", value: 75 }], leagues: [] },
  { name: "Road favourite", outcome: "2", rules: [{ field: "2", op: ">=", value: 60 }], leagues: [] },
  { name: "Blowout watch", outcome: "WM_H6", rules: [{ field: "margin", op: ">=", value: 8 }], leagues: [] },
  { name: "High-scoring", outcome: "TO_O", rules: [{ field: "TO_O", op: ">=", value: 62 }], leagues: [] },
  { name: "Coin flips go close", outcome: "WM_C5", rules: [{ field: "1", op: ">=", value: 45 }, { field: "1", op: "<=", value: 55 }], leagues: [] },
  { name: "Fast starters", outcome: "H1_1", rules: [{ field: "H1_1", op: ">=", value: 62 }], leagues: [] },
  { name: "Strong 1st quarter", outcome: "Q1_1", rules: [{ field: "Q1_1", op: ">=", value: 55 }], leagues: [] },
  { name: "Wire to wire", outcome: "HF_11", rules: [{ field: "HF_11", op: ">=", value: 60 }], leagues: [] },
];
const BLANK: Strategy = { name: "", outcome: "1", rules: [{ field: "1", op: ">=", value: 60 }], leagues: [] };

type Row = Record<string, number | null>;

function valueOf(row: Row, field: string, outcome: string): number | null {
  if (field === "edge") {
    const o = ODDS_COL[outcome] ? row[ODDS_COL[outcome]] : null;
    const p = row[outcome];
    return o != null && p != null ? (p * o - 1) * 100 : null;
  }
  const v = row[field];
  if (v == null) return null;
  return FIELD[field]?.kind === "prob" ? v * 100 : v;
}

const passes = (row: Row, s: Strategy) =>
  s.rules.every((r) => {
    const v = valueOf(row, r.field, s.outcome);
    return v != null && (r.op === ">=" ? v >= r.value : v <= r.value);
  });

interface Summary { picks: number; won: number; settled: number; staked: number; meanOdds: number | null; profit: number; roi: number | null; curve: number[] }

const col = (bt: Backtest, c: string) => (bt[c] as (number | null)[] | undefined) ?? [];

/** Probability of an outcome in backtest row i, deriving unders from overs. */
function probAt(bt: Backtest, i: number, key: string): number | null {
  if (COMPLEMENT[key]) {
    const o = col(bt, COMPLEMENT[key])[i];
    return o == null ? null : 1 - o;
  }
  return col(bt, key)[i] ?? null;
}

function wonAt(bt: Backtest, i: number, outcome: string) {
  const ln: Partial<Lines> = {};
  for (const c of Object.keys(bt)) if (c.startsWith("ln_") && col(bt, c)[i] != null) ln[c.slice(3)] = col(bt, c)[i]!;
  const [hg, ag] = [bt.hg[i], bt.ag[i]];
  const sc = Object.fromEntries(SCORES.map((c) => [c, col(bt, c)[i]]));
  const per: PeriodScores = {};
  if (sc.h1h != null && sc.h1a != null) {
    per.H1 = [sc.h1h, sc.h1a];
    per.H2 = [hg - sc.h1h, ag - sc.h1a];
  }
  for (let k = 1; k <= 4; k++) if (sc[`q${k}h`] != null && sc[`q${k}a`] != null) per[`Q${k}`] = [sc[`q${k}h`]!, sc[`q${k}a`]!];
  return settle(outcome, [hg, ag], ln, per);
}

function summarise(bt: Backtest, idx: number[], s: Strategy): Summary & { byLeague: Map<string, Summary> } {
  const oc = ODDS_COL[s.outcome];
  const mk = (): Summary => ({ picks: 0, won: 0, settled: 0, staked: 0, meanOdds: null, profit: 0, roi: null, curve: [] });
  const total = mk();
  const byLeague = new Map<string, Summary>();
  let oddsSum = 0;
  for (const i of idx) {
    const w = wonAt(bt, i, s.outcome);
    const lg = bt.league[i];
    if (!byLeague.has(lg)) byLeague.set(lg, mk());
    const o = oc ? col(bt, oc)[i] : null;
    for (const t of [total, byLeague.get(lg)!]) {
      t.picks++;
      if (w === null) continue;
      t.settled++;
      if (w) t.won++;
      if (o != null) {
        t.profit += w ? o - 1 : -1;
        t.staked++;
      }
    }
    if (o != null) oddsSum += o;
    total.curve.push(total.settled ? total.won / total.settled : 0);
  }
  total.meanOdds = total.staked ? oddsSum / total.staked : null;
  for (const t of [total, ...byLeague.values()]) t.roi = t.staked >= 20 ? t.profit / t.staked : null;
  return { ...total, byLeague };
}

/**
 * Pre-game scanner: an outcome plus rules on the model's probabilities and
 * expected score, backtested on the walk-forward predictions and run on
 * upcoming games. Lines in the backtest are the model's own spread and the
 * league's trailing-average total, as ESPN keeps no historical lines.
 */
export function Scanner({ fixtures, leagues, today }: { fixtures: FixtureSlim[]; leagues: LeagueInfo[]; today: string }) {
  const [bt, setBt] = useState<Backtest | null>(null);
  const [failed, setFailed] = useState(false);
  const [s, setS] = useState<Strategy>(SUGGESTED[0]);
  const [months, setMonths] = useState<"3" | "6" | "12" | "all">("12");
  const [mine, setMine] = useJsonPref<Strategy[]>("fs-bb-strategies", []);
  const byCode = useMemo(() => Object.fromEntries(leagues.map((l) => [l.code, l])), [leagues]);

  useEffect(() => {
    let live = true;
    fetch("/data/basketball/backtest.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Backtest) => live && setBt(d))
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);

  const rowAt = useMemo(() => {
    if (!bt) return null;
    const cols = [...OUTCOMES, ...Object.values(ODDS_COL)];
    return (i: number): Row => {
      const r: Row = Object.fromEntries(cols.map((c) => [c, OUTCOMES.includes(c) ? probAt(bt, i, c) : (col(bt, c)[i] ?? null)]));
      const eh = col(bt, "eh")[i], ea = col(bt, "ea")[i];
      r.margin = eh != null && ea != null ? eh - ea : null;
      r.total = eh != null && ea != null ? eh + ea : null;
      return r;
    };
  }, [bt]);

  const sample = useMemo(() => {
    if (!bt) return [] as number[];
    const last = bt.date[bt.n - 1];
    const from = months === "all" ? "" : new Date(Date.parse(last) - Number(months) * 30.4 * 86_400_000).toISOString().slice(0, 10);
    const out: number[] = [];
    for (let i = 0; i < bt.n; i++) if (bt.date[i] >= from) out.push(i);
    return out;
  }, [bt, months]);

  const run = (strat: Strategy) => {
    if (!bt || !rowAt) return null;
    const idx = sample.filter((i) => (!strat.leagues.length || strat.leagues.includes(bt.league[i])) && passes(rowAt(i), strat));
    return { idx, ...summarise(bt, idx, strat) };
  };
  const result = useMemo(() => run(s), [s, sample, bt, rowAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const suggested = useMemo(() => SUGGESTED.map((x) => ({ x, r: run(x) })), [sample, bt, rowAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const upcoming = useMemo(
    () =>
      fixtures.filter((f) => {
        if (s.leagues.length && !s.leagues.includes(f.league)) return false;
        const row: Row = Object.fromEntries(OUTCOMES.map((k) => [k, f.p[k] ?? null]));
        for (const [k, c] of Object.entries(ODDS_COL)) row[c] = f.odds?.[k] ?? null;
        row.margin = f.pts[0] - f.pts[1];
        row.total = f.pts[0] + f.pts[1];
        return passes(row, s);
      }),
    [fixtures, s],
  );

  const download = () => {
    if (!bt || !result) return;
    const lines = [["date", "league", "home_pts", "away_pts", `p_${s.outcome}`, "won"].join(",")];
    for (const i of result.idx) lines.push([bt.date[i], bt.league[i], bt.hg[i], bt.ag[i], probAt(bt, i, s.outcome), wonAt(bt, i, s.outcome) ? 1 : 0].join(","));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${(s.name || "strategy").replace(/\W+/g, "-")}-backtest.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const setRule = (i: number, patch: Partial<Rule>) => setS({ ...s, rules: s.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div className="space-y-6">
      <section>
        <h2 className="eyebrow mb-3 !text-ink-2">Suggested strategies · last {months === "all" ? "full history" : `${months} months`}</h2>
        <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 xl:grid-cols-3">
          {[...suggested, ...mine.map((x) => ({ x, r: run(x) }))].map(({ x, r }) => (
            <button
              key={x.name}
              type="button"
              onClick={() => setS(x)}
              className={cx("w-64 shrink-0 rounded-xl border bg-surface p-4 text-left shadow-card transition-colors sm:w-auto", s.name === x.name ? "border-accent" : "border-line hover:border-line-strong")}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{x.name}</span>
                {mine.some((m) => m.name === x.name) && <span className="eyebrow">Mine</span>}
              </div>
              <div className="mt-0.5 text-xs text-ink-3">{LABELS[x.outcome]}</div>
              {r ? (
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="Picks" value={r.picks.toLocaleString()} />
                  <MiniStat label="Hit" value={pct(r.settled ? r.won / r.settled : null)} />
                  <MiniStat label="Break-even" value={r.won ? (r.settled / r.won).toFixed(2) : "–"} />
                </div>
              ) : (
                <div className="mt-3 h-10 animate-pulse rounded-md bg-surface-2" />
              )}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[24rem_1fr]">
        <Card title="Strategy" hint="All rules must hold. Percentages for probabilities and edge, points for the expected score.">
          <div className="space-y-5">
            <Field label="Desired outcome">
              <div className="flex flex-wrap gap-1.5">
                {OUTCOMES.map((k) => (
                  <button key={k} type="button" className={cx(chip(s.outcome === k), "py-1 text-xs")} onClick={() => setS({ ...s, outcome: k })}>{LABELS[k]}</button>
                ))}
              </div>
            </Field>
            <div>
              <span className="eyebrow">Rules</span>
              <ul className="mt-2 space-y-2">
                {s.rules.map((r, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <select aria-label="Field" className={cx(input, "min-w-0 flex-1 px-2")} value={r.field} onChange={(e) => setRule(i, { field: e.target.value })}>
                      {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <select aria-label="Comparison" className={cx(input, "w-14 px-1.5")} value={r.op} onChange={(e) => setRule(i, { op: e.target.value as Rule["op"] })}>
                      <option value=">=">≥</option>
                      <option value="<=">≤</option>
                    </select>
                    <input aria-label="Value" type="number" step={FIELD[r.field]?.kind === "odds" ? 0.05 : FIELD[r.field]?.kind === "pts" ? 0.5 : 1} className={cx(input, "w-20 px-2 tabular")} value={r.value} onChange={(e) => setRule(i, { value: Number(e.target.value) })} />
                    <button type="button" aria-label="Remove rule" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-bad" onClick={() => setS({ ...s, rules: s.rules.filter((_, j) => j !== i) })}>
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
              {s.rules.length < 10 && (
                <button type="button" className={cx(button("ghost"), "mt-2 -ml-2")} onClick={() => setS({ ...s, rules: [...s.rules, { field: s.outcome, op: ">=", value: 50 }] })}>
                  <Plus size={14} /> Add rule
                </button>
              )}
              {s.rules.some((r) => FIELD[r.field]?.kind === "odds" || r.field === "edge") && (
                <p className="mt-1 text-xs text-warn">Rules on odds only match live predictions: ESPN keeps no historical odds, so the backtest has none.</p>
              )}
            </div>
            <Field label="Leagues">
              <LeaguePicker leagues={leagues} value={s.leagues} onChange={(l) => setS({ ...s, leagues: l })} />
            </Field>
            <form
              className="flex gap-2 border-t border-line pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                const name = s.name.trim();
                if (!name || SUGGESTED.some((x) => x.name === name)) return;
                setMine([...mine.filter((m) => m.name !== name), { ...s, name }]);
              }}
            >
              <input className={cx(input, "min-w-0 flex-1")} placeholder="Strategy name" value={SUGGESTED.some((x) => x.name === s.name) ? "" : s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
              <button type="submit" className={button("secondary")}><Save size={14} /> Save</button>
              {mine.some((m) => m.name === s.name) && (
                <button type="button" aria-label="Delete strategy" className={button("ghost")} onClick={() => { setMine(mine.filter((m) => m.name !== s.name)); setS(BLANK); }}>
                  <Trash2 size={14} />
                </button>
              )}
            </form>
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented label="Backtest period" value={months} onChange={setMonths} options={[{ id: "3", label: "3 months" }, { id: "6", label: "6 months" }, { id: "12", label: "12 months" }, { id: "all", label: "All" }]} />
            <button type="button" className={button("secondary")} onClick={download} disabled={!result?.picks}><Download size={14} /> CSV</button>
          </div>
          {failed ? (
            <EmptyState title="Backtest data unavailable">Run <code>python -m footballseer basketball backtest</code> to generate it.</EmptyState>
          ) : !result ? (
            <div className="h-48 animate-pulse rounded-xl bg-surface-2" aria-busy="true" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Picks" value={result.picks.toLocaleString()} sub={`of ${sample.length.toLocaleString()} games`} />
                <Stat label="Success rate" value={pct(result.settled ? result.won / result.settled : null, 1)} sub={result.settled < result.picks ? `${result.picks - result.settled} pushes or no data` : undefined} />
                <Stat label="Break-even odds" value={result.won ? (result.settled / result.won).toFixed(2) : "–"} sub="a price above this would have profited" />
                <Stat
                  label="ROI at book odds"
                  value={<span className={result.roi == null ? "" : result.roi >= 0 ? "text-good" : "text-bad"}>{signedPct(result.roi)}</span>}
                  sub={result.staked ? <>{result.staked} priced picks{result.meanOdds ? <> · mean <Odds odds={result.meanOdds} /></> : null}</> : "no historical odds"}
                />
              </div>
              <Card title="Success rate over time" hint={`${result.picks} picks in date order`}>
                <Curve values={result.curve} />
              </Card>
              <Card title="By league" flush>
                <table className="w-full text-sm tabular">
                  <thead className="text-[11px] tracking-wider text-ink-3 uppercase">
                    <tr className="border-y border-line">
                      <th className="py-2 pl-4 text-left font-medium sm:pl-5">League</th>
                      <th className="py-2 text-right font-medium">Picks</th>
                      <th className="py-2 pr-4 text-right font-medium sm:pr-5">Hit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...result.byLeague.entries()].sort((a, b) => b[1].picks - a[1].picks).map(([lg, t]) => (
                      <tr key={lg} className="border-b border-line last:border-0">
                        <td className="py-2 pl-4 sm:pl-5">{byCode[lg] ? `${byCode[lg].country} · ${byCode[lg].name}` : lg}</td>
                        <td className="py-2 text-right">{t.picks}</td>
                        <td className="py-2 pr-4 text-right sm:pr-5">{pct(t.settled ? t.won / t.settled : null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
          <Card title="Upcoming games that fit" hint="The scanner runs this strategy on the next few days' fixtures" flush>
            {upcoming.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-ink-3 sm:px-5">No upcoming game fits right now.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {upcoming.slice(0, 40).map((f) => (
                  <li key={f.id}>
                    <Link href={`/basketball/match/${f.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/70 sm:px-5">
                      <span className="w-16 shrink-0 font-mono text-[11px] text-ink-3">{formatDay(f.date, today).replace("Tomorrow", "Tmrw")}<br />{f.time}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{f.home} <span className="text-ink-3">v</span> {f.away}</span>
                        <span className="block truncate text-xs text-ink-3">{byCode[f.league]?.country} · {byCode[f.league]?.name}</span>
                      </span>
                      <ProbPill p={f.p[s.outcome]} size="sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 py-1.5">
      <div className="text-sm font-semibold tabular">{value}</div>
      <div className="text-[10px] tracking-wider text-ink-3 uppercase">{label}</div>
    </div>
  );
}

/** Running success rate as a single line. */
function Curve({ values }: { values: number[] }) {
  if (values.length < 2) return <p className="text-sm text-ink-3">Not enough picks to draw.</p>;
  const W = 640, H = 180, P = { l: 44, r: 8, t: 10, b: 20 };
  const step = Math.max(1, Math.floor(values.length / 400));
  const pts = values.filter((_, i) => i % step === 0 || i === values.length - 1);
  const x = (i: number) => P.l + (i / (pts.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - v * (H - P.t - P.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Success rate ends at ${pct(pts.at(-1))}`}>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t === 0.5 ? "" : "3 3"} />
          <text x={P.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--text-3)">{pct(t)}</text>
        </g>
      ))}
      <polyline fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" points={pts.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
    </svg>
  );
}

"use client";

import { Download, Plus, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Odds } from "@/components/client";
import { LeaguePicker } from "@/components/Pickers";
import { Segmented } from "@/components/TeamTables";
import { button, Card, chip, cx, EmptyState, Field, input, ProbPill, Stat } from "@/components/ui";
import { formatDay, LABELS, pct, signedPct } from "@/lib/format";
import { useJsonPref } from "@/lib/prefs";
import { settle } from "@/lib/settle";
import { useToday } from "@/lib/today";
import type { Backtest, FixtureSlim, LeagueInfo } from "@/lib/types";

const OUTCOMES = ["1", "X", "2", "1X", "X2", "O1.5", "O2.5", "O3.5", "U2.5", "U3.5", "BTTS_Y", "BTTS_N"];
/** Bookmaker odds column for outcomes the data prices, so ROI can be measured. */
const ODDS_COL: Record<string, string> = { "1": "odds_h", X: "odds_d", "2": "odds_a", "O2.5": "odds_o25", "U2.5": "odds_u25" };
const FIX_ODDS: Record<string, string> = { odds_h: "1", odds_d: "X", odds_a: "2", odds_o25: "O2.5", odds_u25: "U2.5" };

const FIELDS: { key: string; label: string; kind: "prob" | "odds" | "edge" }[] = [
  ...OUTCOMES.map((k) => ({ key: k, label: `P(${LABELS[k]})`, kind: "prob" as const })),
  { key: "odds_h", label: "Home odds", kind: "odds" },
  { key: "odds_d", label: "Draw odds", kind: "odds" },
  { key: "odds_a", label: "Away odds", kind: "odds" },
  { key: "odds_o25", label: "Over 2.5 odds", kind: "odds" },
  { key: "odds_u25", label: "Under 2.5 odds", kind: "odds" },
  { key: "edge", label: "Edge on outcome", kind: "edge" },
];
const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

interface Rule { field: string; op: ">=" | "<="; value: number }
interface Strategy { name: string; outcome: string; rules: Rule[]; leagues: string[] }

const SUGGESTED: Strategy[] = [
  { name: "Strong home favourite", outcome: "1", rules: [{ field: "1", op: ">=", value: 65 }], leagues: [] },
  { name: "Goals expected", outcome: "O2.5", rules: [{ field: "O2.5", op: ">=", value: 62 }], leagues: [] },
  { name: "Value on the over", outcome: "O2.5", rules: [{ field: "edge", op: ">=", value: 5 }, { field: "odds_o25", op: "<=", value: 2.6 }], leagues: [] },
  { name: "Low-scoring", outcome: "U2.5", rules: [{ field: "U2.5", op: ">=", value: 60 }], leagues: [] },
  { name: "Away value", outcome: "2", rules: [{ field: "edge", op: ">=", value: 5 }, { field: "odds_a", op: "<=", value: 4 }], leagues: [] },
  { name: "Both score", outcome: "BTTS_Y", rules: [{ field: "BTTS_Y", op: ">=", value: 62 }], leagues: [] },
];

const BLANK: Strategy = { name: "", outcome: "O2.5", rules: [{ field: "O2.5", op: ">=", value: 60 }], leagues: [] };

type Row = Record<string, number | null>;

function valueOf(row: Row, field: string, outcome: string): number | null {
  if (field === "edge") {
    const col = ODDS_COL[outcome];
    const o = col ? row[col] : null;
    const p = row[outcome];
    return o != null && p != null ? (p * o - 1) * 100 : null;
  }
  const v = row[field];
  if (v == null) return null;
  return FIELD[field].kind === "prob" ? v * 100 : v;
}

const passes = (row: Row, s: Strategy) =>
  s.rules.every((r) => {
    const v = valueOf(row, r.field, s.outcome);
    return v != null && (r.op === ">=" ? v >= r.value : v <= r.value);
  });

/** `staked` counts settled picks that had a price, the denominator for ROI. */
interface Summary { picks: number; won: number; settled: number; staked: number; meanOdds: number | null; profit: number | null; roi: number | null; curve: number[] }

function summarise(bt: Backtest, idx: number[], s: Strategy): Summary & { byLeague: Map<string, Summary> } {
  const col = ODDS_COL[s.outcome];
  const mk = (): Summary => ({ picks: 0, won: 0, settled: 0, staked: 0, meanOdds: null, profit: col ? 0 : null, roi: null, curve: [] });
  const total = mk();
  const byLeague = new Map<string, Summary>();
  let oddsSum = 0, oddsN = 0;
  for (const i of idx) {
    const w = settle(s.outcome, bt.hg[i], bt.ag[i]);
    const lg = bt.league[i];
    if (!byLeague.has(lg)) byLeague.set(lg, mk());
    for (const t of [total, byLeague.get(lg)!]) {
      t.picks++;
      if (w === null) continue;
      t.settled++;
      if (w) t.won++;
      if (col) {
        const o = (bt[col] as (number | null)[])[i];
        if (o != null) {
          t.profit! += w ? o - 1 : -1;
          t.staked++;
        }
      }
    }
    if (col) {
      const o = (bt[col] as (number | null)[])[i];
      if (o != null) { oddsSum += o; oddsN++; }
      total.curve.push(total.profit!);
    } else {
      total.curve.push(total.settled ? total.won / total.settled : 0);
    }
  }
  total.meanOdds = oddsN ? oddsSum / oddsN : null;
  for (const t of [total, ...byLeague.values()]) if (t.profit != null && t.staked) t.roi = t.profit / t.staked;
  return { ...total, byLeague };
}

/**
 * Pre-match scanner: a strategy is an outcome plus rules on the model's
 * probabilities, the bookmaker odds and the edge. It is backtested on the
 * walk-forward predictions and run against upcoming fixtures.
 */
export function Scanner({ fixtures, leagues, today: asOf }: { fixtures: FixtureSlim[]; leagues: LeagueInfo[]; today: string }) {
  const today = useToday(asOf);
  const [bt, setBt] = useState<Backtest | null>(null);
  const [failed, setFailed] = useState(false);
  const [s, setS] = useState<Strategy>(SUGGESTED[1]);
  const [months, setMonths] = useState<"3" | "6" | "12" | "all">("12");
  const [mine, setMine] = useJsonPref<Strategy[]>("fs-strategies", []);
  const byCode = useMemo(() => Object.fromEntries(leagues.map((l) => [l.code, l])), [leagues]);

  useEffect(() => {
    let live = true;
    fetch("/data/backtest.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Backtest) => live && setBt(d))
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);

  const rowAt = useMemo(() => {
    if (!bt) return null;
    const cols = [...OUTCOMES, ...Object.keys(FIX_ODDS)];
    return (i: number): Row => Object.fromEntries(cols.map((c) => [c, (bt[c] as (number | null)[])[i]]));
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

  const upcoming = useMemo(() => {
    return fixtures.filter((f) => {
      if (s.leagues.length && !s.leagues.includes(f.league)) return false;
      const row: Row = { ...Object.fromEntries(OUTCOMES.map((k) => [k, f.p[k] ?? null])) };
      for (const [col, k] of Object.entries(FIX_ODDS)) row[col] = f.odds?.[k] ?? null;
      return passes(row, s);
    });
  }, [fixtures, s]);

  const download = () => {
    if (!bt || !result) return;
    const col = ODDS_COL[s.outcome];
    const lines = [["date", "league", "home_goals", "away_goals", `p_${s.outcome}`, "odds", "won"].join(",")];
    for (const i of result.idx) {
      const o = col ? (bt[col] as (number | null)[])[i] : null;
      lines.push([bt.date[i], bt.league[i], bt.hg[i], bt.ag[i], (bt[s.outcome] as number[])[i], o ?? "", settle(s.outcome, bt.hg[i], bt.ag[i]) ? 1 : 0].join(","));
    }
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${(s.name || "strategy").replace(/\W+/g, "-")}-backtest.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const setRule = (i: number, patch: Partial<Rule>) => setS({ ...s, rules: s.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const hasOdds = !!ODDS_COL[s.outcome];

  return (
    <div className="space-y-6">
      {/* Suggested strategies */}
      <section>
        <h2 className="eyebrow mb-3 !text-ink-2">Suggested strategies · last {months === "all" ? "full history" : `${months} months`}</h2>
        <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 xl:grid-cols-3">
          {[...suggested, ...mine.map((x) => ({ x, r: run(x) }))].map(({ x, r }) => (
            <button
              key={x.name}
              type="button"
              onClick={() => setS(x)}
              className={cx(
                "w-64 shrink-0 rounded-xl border bg-surface p-4 text-left shadow-card transition-colors sm:w-auto",
                s.name === x.name ? "border-accent" : "border-line hover:border-line-strong",
              )}
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
                  <MiniStat label="ROI" value={r.roi != null ? signedPct(r.roi) : "–"} tone={r.roi == null ? undefined : r.roi >= 0 ? "good" : "bad"} />
                </div>
              ) : (
                <div className="mt-3 h-10 animate-pulse rounded-md bg-surface-2" />
              )}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[24rem_1fr]">
        {/* Builder */}
        <Card title="Strategy" hint="All rules must hold. Percentages for probabilities and edge.">
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
                    <input aria-label="Value" type="number" step={FIELD[r.field]?.kind === "odds" ? 0.05 : 1} className={cx(input, "w-20 px-2 tabular")} value={r.value} onChange={(e) => setRule(i, { value: Number(e.target.value) })} />
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
              {s.rules.some((r) => r.field === "edge") && !hasOdds && (
                <p className="mt-1 text-xs text-warn">Edge needs bookmaker odds, which the data has only for 1X2 and over/under 2.5.</p>
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

        {/* Results */}
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented label="Backtest period" value={months} onChange={setMonths} options={[{ id: "3", label: "3 months" }, { id: "6", label: "6 months" }, { id: "12", label: "12 months" }, { id: "all", label: "All" }]} />
            <button type="button" className={button("secondary")} onClick={download} disabled={!result?.picks}><Download size={14} /> CSV</button>
          </div>
          {failed ? (
            <EmptyState title="Backtest data unavailable">Run the pipeline&apos;s backtest to generate it.</EmptyState>
          ) : !result ? (
            <div className="h-48 animate-pulse rounded-xl bg-surface-2" aria-busy="true" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Picks" value={result.picks.toLocaleString()} sub={`of ${sample.length.toLocaleString()} matches`} />
                <Stat label="Success rate" value={pct(result.settled ? result.won / result.settled : null, 1)} sub={result.settled ? `break-even odds ${(result.settled / Math.max(1, result.won)).toFixed(2)}` : undefined} />
                <Stat label="Mean odds" value={result.meanOdds ? <Odds odds={result.meanOdds} /> : "–"} sub={hasOdds ? "average bookmaker price" : "no odds for this market"} />
                <Stat
                  label="ROI, flat stake"
                  value={<span className={result.roi == null ? "" : result.roi >= 0 ? "text-good" : "text-bad"}>{signedPct(result.roi)}</span>}
                  sub={result.profit != null ? `${result.profit >= 0 ? "+" : ""}${result.profit.toFixed(1)} units` : "needs bookmaker odds"}
                />
              </div>
              <Card title={hasOdds ? "Profit over time" : "Success rate over time"} hint={`${result.picks} picks in date order`}>
                <Curve values={result.curve} money={hasOdds} />
              </Card>
              <Card title="By league" flush>
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm tabular">
                    <thead className="sticky top-0 bg-surface text-[11px] tracking-wider text-ink-3 uppercase">
                      <tr className="border-y border-line">
                        <th className="py-2 pl-4 text-left font-medium sm:pl-5">League</th>
                        <th className="py-2 text-right font-medium">Picks</th>
                        <th className="py-2 text-right font-medium">Hit</th>
                        <th className="py-2 pr-4 text-right font-medium sm:pr-5">ROI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...result.byLeague.entries()].sort((a, b) => b[1].picks - a[1].picks).map(([lg, t]) => (
                        <tr key={lg} className="border-b border-line last:border-0">
                          <td className="py-2 pl-4 sm:pl-5">{byCode[lg] ? `${byCode[lg].country} · ${byCode[lg].name}` : lg}</td>
                          <td className="py-2 text-right">{t.picks}</td>
                          <td className="py-2 text-right">{pct(t.settled ? t.won / t.settled : null)}</td>
                          <td className={cx("py-2 pr-4 text-right font-semibold sm:pr-5", t.roi == null ? "text-ink-3" : t.roi >= 0 ? "text-good" : "text-bad")}>{signedPct(t.roi)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
          <Card title="Upcoming matches that fit" hint="The scanner runs this strategy on the next few days' fixtures" flush>
            {upcoming.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-ink-3 sm:px-5">No upcoming match fits right now.{s.rules.some((r) => FIELD[r.field]?.kind !== "prob") && " Rules on odds need bookmaker prices, which appear a few days before kick-off."}</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {upcoming.slice(0, 40).map((f) => (
                  <li key={f.id}>
                    <Link href={`/match/${f.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/70 sm:px-5">
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

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-md bg-surface-2 py-1.5">
      <div className={cx("text-sm font-semibold tabular", tone === "good" && "text-good", tone === "bad" && "text-bad")}>{value}</div>
      <div className="text-[10px] tracking-wider text-ink-3 uppercase">{label}</div>
    </div>
  );
}

/** Cumulative profit (units) or running success rate, as a single line. */
function Curve({ values, money }: { values: number[]; money: boolean }) {
  if (values.length < 2) return <p className="text-sm text-ink-3">Not enough picks to draw.</p>;
  const W = 640, H = 180, P = { l: 44, r: 8, t: 10, b: 20 };
  const step = Math.max(1, Math.floor(values.length / 400));
  const pts = values.filter((_, i) => i % step === 0 || i === values.length - 1);
  const lo = Math.min(0, ...pts), hi = Math.max(money ? 0 : 1, ...pts);
  const x = (i: number) => P.l + (i / (pts.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - ((v - lo) / (hi - lo || 1)) * (H - P.t - P.b);
  const ticks = money ? [lo, 0, hi] : [0, 0.5, 1];
  const end = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={money ? `Profit ends at ${end.toFixed(1)} units` : `Success rate ends at ${pct(end)}`}>
      {[...new Set(ticks)].map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t === 0 ? "" : "3 3"} />
          <text x={P.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--text-3)">{money ? `${t > 0 ? "+" : ""}${t.toFixed(0)}u` : pct(t)}</text>
        </g>
      ))}
      <polyline fill="none" stroke={money ? (end >= 0 ? "var(--good)" : "var(--bad)") : "var(--accent)"} strokeWidth={2} strokeLinejoin="round" points={pts.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
    </svg>
  );
}

import { gameClock } from "./model";
import type { Lines, LiveEvent, PeriodScores, Probs, Trend } from "./types";

/*
 * Basketball market keys (pipeline/footballseer/basketball/markets.py). Spread
 * and totals markets are priced at a line carried with each game, so their
 * display names need the game's `Lines`. Period markets are "<period>_<outcome>":
 * H1_1 (home wins the 1st half), Q3_O (over the 3rd-quarter total), H2_HT_O…
 */

export const PERIODS = ["H1", "H2", "Q1", "Q2", "Q3", "Q4"] as const;
export const PERIOD_NAMES: Record<string, string> = {
  H1: "1st half", H2: "2nd half", Q1: "1st quarter", Q2: "2nd quarter", Q3: "3rd quarter", Q4: "4th quarter",
};
const PERIOD_SHORT: Record<string, string> = { H1: "1H", H2: "2H", Q1: "Q1", Q2: "Q2", Q3: "Q3", Q4: "Q4" };

const GAME_LABELS: Record<string, string> = {
  "1": "Home win",
  "2": "Away win",
  SP_H: "Home covers the spread",
  SP_A: "Away covers the spread",
  TO_O: "Over the total",
  TO_U: "Under the total",
  HT_O: "Home over team total",
  HT_U: "Home under team total",
  AT_O: "Away over team total",
  AT_U: "Away under team total",
  WM_H6: "Home wins by 6+",
  WM_A6: "Away wins by 6+",
  WM_H11: "Home wins by 11+",
  WM_A11: "Away wins by 11+",
  WM_C5: "Decided by 5 or fewer",
};

const PERIOD_OUTCOMES: Record<string, (p: string) => string> = {
  "1": (p) => `Home wins the ${p}`,
  X: (p) => `${p[0].toUpperCase()}${p.slice(1)} level`,
  "2": (p) => `Away wins the ${p}`,
  SP_H: (p) => `Home covers the ${p} spread`,
  SP_A: (p) => `Away covers the ${p} spread`,
  O: (p) => `Over the ${p} total`,
  U: (p) => `Under the ${p} total`,
  HT_O: (p) => `Home over ${p} team total`,
  HT_U: (p) => `Home under ${p} team total`,
  AT_O: (p) => `Away over ${p} team total`,
  AT_U: (p) => `Away under ${p} team total`,
};

/** Half-time / full-time: leader at the half, then the winner. */
export const HTFT: Record<string, string> = {
  HF_11: "Home leads at half, home wins", HF_12: "Home leads at half, away wins",
  HF_X1: "Level at half, home wins", HF_X2: "Level at half, away wins",
  HF_21: "Away leads at half, home wins", HF_22: "Away leads at half, away wins",
};

export const LABELS: Record<string, string> = {
  ...GAME_LABELS,
  ...Object.fromEntries(PERIODS.flatMap((p) => Object.entries(PERIOD_OUTCOMES).map(([o, f]) => [`${p}_${o}`, f(PERIOD_NAMES[p])]))),
  ...HTFT,
};

/** A period key split into period and outcome, or null for a full-game key. */
export function periodOf(key: string): { p: string; o: string } | null {
  const m = /^(H[12]|Q[1-4])_(.+)$/.exec(key);
  return m ? { p: m[1], o: m[2] } : null;
}

/** Bookmaker odds exist for these keys (fixture.odds uses the market key). */
export const PRICED = new Set(["1", "2", "SP_H", "SP_A", "TO_O", "TO_U"]);

export const MARKET_GROUPS: { title: string; keys: string[] }[] = [
  { title: "Moneyline", keys: ["1", "2"] },
  { title: "Spread", keys: ["SP_H", "SP_A"] },
  { title: "Total points", keys: ["TO_O", "TO_U"] },
  { title: "Team totals", keys: ["HT_O", "HT_U", "AT_O", "AT_U"] },
  { title: "Winning margin", keys: ["WM_H6", "WM_A6", "WM_H11", "WM_A11", "WM_C5"] },
  { title: "Half-time / full-time", keys: Object.keys(HTFT) },
];

/** The markets shown for each period, grouped like the full game. */
export const PERIOD_GROUPS = (p: string) => [
  { title: "Result", keys: [`${p}_1`, `${p}_X`, `${p}_2`] },
  { title: "Spread", keys: [`${p}_SP_H`, `${p}_SP_A`] },
  { title: "Total", keys: [`${p}_O`, `${p}_U`] },
  { title: "Team totals", keys: [`${p}_HT_O`, `${p}_HT_U`, `${p}_AT_O`, `${p}_AT_U`] },
];

/** "−5.5" / "+3" with a real minus sign. */
export const signed = (x: number) => (x > 0 ? `+${x}` : x < 0 ? `−${Math.abs(x)}` : "0");

export interface MarketTab {
  id: string;
  label: string;
  market: string;
  outcomes: string[];
}

const TOP_TIP_KEYS = ["1", "2", "SP_H", "SP_A", "TO_O", "TO_U", "WM_H6", "WM_A6", "H1_1", "H1_2"];

export const MARKET_TABS: MarketTab[] = [
  { id: "top", label: "Top tips", market: "", outcomes: [] },
  { id: "ml", label: "Moneyline", market: "Moneyline", outcomes: ["1", "2"] },
  { id: "spread", label: "Spread", market: "Spread", outcomes: ["SP_H", "SP_A"] },
  { id: "total", label: "Total points", market: "Total", outcomes: ["TO_O", "TO_U"] },
  { id: "team", label: "Team totals", market: "Team total", outcomes: ["HT_O", "HT_U", "AT_O", "AT_U"] },
  { id: "margin", label: "Winning margin", market: "Margin", outcomes: ["WM_H6", "WM_A6", "WM_C5"] },
  { id: "h1", label: "1st half", market: "1st half", outcomes: ["H1_1", "H1_X", "H1_2"] },
  { id: "h1sp", label: "1st-half spread", market: "1st-half spread", outcomes: ["H1_SP_H", "H1_SP_A"] },
  { id: "h1to", label: "1st-half total", market: "1st-half total", outcomes: ["H1_O", "H1_U"] },
  { id: "h1tt", label: "1st-half team totals", market: "1st-half team total", outcomes: ["H1_HT_O", "H1_HT_U", "H1_AT_O", "H1_AT_U"] },
  { id: "h2", label: "2nd half", market: "2nd half", outcomes: ["H2_1", "H2_X", "H2_2"] },
  { id: "h2to", label: "2nd-half total", market: "2nd-half total", outcomes: ["H2_O", "H2_U"] },
  ...(["Q1", "Q2", "Q3", "Q4"] as const).flatMap((q) => [
    { id: q.toLowerCase(), label: `${q} winner`, market: q, outcomes: [`${q}_1`, `${q}_X`, `${q}_2`] },
    { id: `${q.toLowerCase()}to`, label: `${q} total`, market: `${q} total`, outcomes: [`${q}_O`, `${q}_U`] },
  ]),
  { id: "htft", label: "Half-time / full-time", market: "HT/FT", outcomes: Object.keys(HTFT) },
];

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
/** Line for a market: the game's, or the period's ("H1to"). */
const lineOf = (ln: Partial<Lines>, p: string | null, k: "sp" | "to" | "ht" | "at") => num(ln[p ? `${p}${k}` : k]);

/** [market, pick] as shown in a row, e.g. ["Spread", "1 −5.5"], ["Q3 total", "O 56.5"]. */
export function pickText(key: string, ln: Partial<Lines>): [string, string] {
  if (key in HTFT) return ["HT/FT", `${key[3]}/${key[4]}`];
  const per = periodOf(key);
  const p = per?.p ?? null;
  const o = per?.o ?? key;
  const pre = p ? `${PERIOD_SHORT[p]} ` : "";
  const sp = lineOf(ln, p, "sp"), to = lineOf(ln, p, "to"), ht = lineOf(ln, p, "ht"), at = lineOf(ln, p, "at");
  switch (o) {
    case "1": return [p ? `${PERIOD_SHORT[p]} result` : "Moneyline", "1"];
    case "X": return [`${PERIOD_SHORT[p!]} result`, "X"];
    case "2": return [p ? `${PERIOD_SHORT[p]} result` : "Moneyline", "2"];
    case "SP_H": return [`${pre}Spread`, sp != null ? `1 ${signed(sp)}` : "1"];
    case "SP_A": return [`${pre}Spread`, sp != null ? `2 ${signed(-sp)}` : "2"];
    case "TO_O": case "O": return [`${pre}Total`, `O ${to ?? ""}`];
    case "TO_U": case "U": return [`${pre}Total`, `U ${to ?? ""}`];
    case "HT_O": return [`${pre}Home total`, `O ${ht ?? ""}`];
    case "HT_U": return [`${pre}Home total`, `U ${ht ?? ""}`];
    case "AT_O": return [`${pre}Away total`, `O ${at ?? ""}`];
    case "AT_U": return [`${pre}Away total`, `U ${at ?? ""}`];
    case "WM_H6": return ["Margin", "1 by 6+"];
    case "WM_A6": return ["Margin", "2 by 6+"];
    case "WM_H11": return ["Margin", "1 by 11+"];
    case "WM_A11": return ["Margin", "2 by 11+"];
    case "WM_C5": return ["Margin", "≤ 5"];
  }
  return [LABELS[key] ?? key, ""];
}

/** Full market name with teams and lines, e.g. "Celtics −5.5" or "Over 56.5 3rd-quarter points". */
export function marketName(key: string, ln: Partial<Lines>, home = "Home", away = "Away") {
  if (key in HTFT) {
    const lead = key[3] === "1" ? `${home} lead at half` : key[3] === "2" ? `${away} lead at half` : "Level at half";
    return `${lead}, ${key[4] === "1" ? home : away} win`;
  }
  const per = periodOf(key);
  const p = per?.p ?? null;
  const o = per?.o ?? key;
  const name = p ? PERIOD_NAMES[p] : "";
  const of = p ? ` ${name}` : "";
  const sp = lineOf(ln, p, "sp"), to = lineOf(ln, p, "to"), ht = lineOf(ln, p, "ht"), at = lineOf(ln, p, "at");
  switch (o) {
    case "1": return p ? `${home} win the ${name}` : `${home} win`;
    case "2": return p ? `${away} win the ${name}` : `${away} win`;
    case "X": return `${name[0].toUpperCase()}${name.slice(1)} level`;
    case "SP_H": return sp != null ? `${home} ${signed(sp)}${of}` : LABELS[key];
    case "SP_A": return sp != null ? `${away} ${signed(-sp)}${of}` : LABELS[key];
    case "TO_O": case "O": return `Over ${to}${of} points`;
    case "TO_U": case "U": return `Under ${to}${of} points`;
    case "HT_O": return `${home} over ${ht}${of}`;
    case "HT_U": return `${home} under ${ht}${of}`;
    case "AT_O": return `${away} over ${at}${of}`;
    case "AT_U": return `${away} under ${at}${of}`;
    case "WM_H6": return `${home} by 6+`;
    case "WM_A6": return `${away} by 6+`;
    case "WM_H11": return `${home} by 11+`;
    case "WM_A11": return `${away} by 11+`;
    case "WM_C5": return "Decided by 5 or fewer";
  }
  return LABELS[key] ?? key;
}

export interface Pick {
  key: string;
  p: number;
}

export function tabPick(tab: MarketTab, p: Probs): Pick | null {
  if (tab.id === "top") return topTip(p);
  let best: Pick | null = null;
  for (const k of tab.outcomes) if (p[k] != null && (!best || p[k] > best.p)) best = { key: k, p: p[k] };
  return best;
}

/** The likeliest main market that still pays something (fair odds 1.18+). */
export function topTip(p: Probs): Pick {
  const cands = TOP_TIP_KEYS.filter((k) => p[k] != null).map((key) => ({ key, p: p[key] }));
  const playable = cands.filter((c) => c.p <= 0.85);
  return (playable.length ? playable : cands).reduce((a, b) => (b.p > a.p ? b : a));
}

/**
 * Scores of the periods already over, from live linescores: quarters (or halves
 * in two-period leagues), the 1st half once it ends, and the 2nd half (with
 * overtime) only at the final buzzer. `completed` counts finished periods.
 */
export function periodsFromLinescore(score: [number, number], periods: [number[], number[]], regulation: number, completed: number, final: boolean): PeriodScores {
  const [h, a] = periods;
  const done = Math.min(completed, h.length, a.length);
  const half = regulation / 2;
  const sum = (x: number[], n: number) => x.slice(0, n).reduce((s, v) => s + v, 0);
  const out: PeriodScores = {};
  if (regulation === 4) for (let k = 0; k < Math.min(done, 4); k++) out[`Q${k + 1}`] = [h[k], a[k]];
  if (done >= half) out.H1 = [sum(h, half), sum(a, half)];
  if (final && out.H1) out.H2 = [score[0] - out.H1[0], score[1] - out.H1[1]];
  return out;
}

/**
 * Did a market win for this final score? null for a push (integer line hit
 * exactly) or when the period's score is needed but missing. `per` holds the
 * period scores; a finished period can be settled before the final buzzer.
 */
export function settle(key: string, score: [number, number] | null, ln: Partial<Lines>, per?: PeriodScores | null): boolean | null {
  const line = (v: number, l: number | undefined) => (l == null || v === l ? null : v > l);
  const not = (x: boolean | null) => (x === null ? null : !x);
  if (key in HTFT) {
    const h1 = per?.H1;
    if (!h1 || !score) return null;
    const lead = h1[0] > h1[1] ? "1" : h1[0] < h1[1] ? "2" : "X";
    return lead === key[3] && (score[0] > score[1] ? "1" : "2") === key[4];
  }
  const pk = periodOf(key);
  let h: number, a: number;
  if (pk) {
    const s = per?.[pk.p];
    if (!s) return null;
    [h, a] = s;
  } else {
    if (!score) return null;
    [h, a] = score;
  }
  const p = pk?.p ?? null;
  const o = pk?.o ?? key;
  const m = h - a, t = h + a;
  const sp = lineOf(ln, p, "sp");
  switch (o) {
    case "1": return m > 0;
    case "X": return m === 0;
    case "2": return m < 0;
    case "SP_H": return line(m, sp == null ? undefined : -sp);
    case "SP_A": return not(line(m, sp == null ? undefined : -sp));
    case "TO_O": case "O": return line(t, lineOf(ln, p, "to"));
    case "TO_U": case "U": return not(line(t, lineOf(ln, p, "to")));
    case "HT_O": return line(h, lineOf(ln, p, "ht"));
    case "HT_U": return not(line(h, lineOf(ln, p, "ht")));
    case "AT_O": return line(a, lineOf(ln, p, "at"));
    case "AT_U": return not(line(a, lineOf(ln, p, "at")));
    case "WM_H6": return m >= 6;
    case "WM_A6": return m <= -6;
    case "WM_H11": return m >= 11;
    case "WM_A11": return m <= -11;
    case "WM_C5": return Math.abs(m) <= 5;
  }
  return null;
}

/**
 * A live pick's result, once it's known: at the final buzzer, or for a period
 * pick (1st quarter, 1st half…) as soon as that period ends.
 */
export function liveSettle(key: string, e: LiveEvent, lines: Lines): boolean | null | undefined {
  const final = e.state === "post";
  if (!final && !periodOf(key)) return undefined;
  const completed = final ? 99 : e.period - (e.clock > 0 ? 1 : 0);
  const per = periodsFromLinescore(e.score, e.periods, gameClock(e.league)[0], completed, final);
  const won = settle(key, final ? e.score : null, lines, per);
  return won === null && !final ? undefined : won;
}

// --------------------------------------------------------------------------- //
// Team events, streaks
// --------------------------------------------------------------------------- //

/** Team event counters from the pipeline (stats.py). Totals events are relative to the league's season average. */
export const EVENT_LABELS: Record<string, string> = {
  W: "Wins", L: "Defeats", W10: "Wins by 10+", L10: "Defeats by 10+", CLOSE: "Close games (≤5)",
  OVR: "Above-average total", UND: "Below-average total", SA: "Scored above average", CA: "Conceded above average",
  H1W: "Won the 1st half", H1L: "Lost the 1st half", H2W: "Won the 2nd half", H2L: "Lost the 2nd half",
  Q1W: "Won the 1st quarter", Q1L: "Lost the 1st quarter", CB: "Comeback wins", OT: "Overtime",
};
/** Events that need half-time scores (denominator nh1) or quarter scores (nq). */
export const H1_EVENTS = new Set(["H1W", "H1L", "H2W", "H2L", "CB"]);
export const Q_EVENTS = new Set(["Q1W", "Q1L"]);

/** The denominator for an event's hit rate. */
export const eventN = (r: { n: number; nh1?: number; nq?: number }, e: string) => (Q_EVENTS.has(e) ? r.nq : H1_EVENTS.has(e) ? r.nh1 : r.n);

const TREND_TEXT: Record<string, string> = {
  W: "Won", L: "Lost", W10: "Won by 10+ in", L10: "Lost by 10+ in",
  OVR: "Above the league's average total in", UND: "Below the league's average total in",
  SA: "Scored above the league average in", CA: "Conceded above the league average in",
  H1W: "Won the 1st half in", H1L: "Lost the 1st half in", H2W: "Won the 2nd half in", Q1W: "Won the 1st quarter in",
};

export const TREND_EVENTS = ["W", "L", "W10", "L10", "OVR", "UND", "SA", "CA", "H1W", "H1L", "H2W", "Q1W"].map((key) => ({ key, label: EVENT_LABELS[key] }));

export function trendText(t: Trend) {
  const scope = t.s === "home" ? "home " : t.s === "away" ? "road " : "";
  return `${TREND_TEXT[t.e] ?? t.e} the last ${t.n} ${scope}games`;
}

/** "W4" → "Won 4", "L2" → "Lost 2". */
export function streakText(s: string) {
  if (!s) return "";
  return `${s[0] === "W" ? "Won" : "Lost"} ${s.slice(1)}`;
}

/** Win percentage as ".625", the way basketball tables show it. */
export const winPct = (w: number, n: number) => (n ? (w / n).toFixed(3).replace(/^0/, "") : "–");

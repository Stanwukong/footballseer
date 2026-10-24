// Browser port of pipeline/footballseer/basketball/{model,markets}.py, for the
// matchup predictor and in-play probabilities.

import type { League, Lines, LiveEvent, Probs } from "./types";

const SPAN = 120;
const OT_SD = 5;

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function phi(z: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

type Pmf = Map<number, number>;

function pmf(mu: number, sd: number, lo: number, hi: number): Pmf {
  const out: Pmf = new Map();
  let total = 0;
  for (let k = Math.floor(lo); k <= Math.ceil(hi); k++) {
    const p = sd > 0 ? phi((k + 0.5 - mu) / sd) - phi((k - 0.5 - mu) / sd) : Math.round(mu) === k ? 1 : 0;
    out.set(k, p);
    total += p;
  }
  for (const [k, p] of out) out.set(k, p / total);
  return out;
}

/** Final home margin, a level score resolved by overtime in proportion to each side's chances. */
function marginPmf(mu: number, sd: number): Pmf {
  const p = pmf(mu, sd, Math.min(mu - SPAN, -20), Math.max(mu + SPAN, 20));
  const tie = p.get(0) ?? 0;
  p.set(0, 0);
  let win = 0, lose = 0;
  for (const [k, v] of p) {
    if (k > 0) win += v;
    else if (k < 0) lose += v;
  }
  if (tie > 0 && win + lose > 0) {
    const w = Array.from({ length: 15 }, (_, i) => Math.exp(-((i + 1) ** 2) / (2 * OT_SD ** 2)));
    const s = w.reduce((a, b) => a + b, 0);
    w.forEach((x, i) => {
      p.set(i + 1, (p.get(i + 1) ?? 0) + (tie * x * win) / (s * (win + lose)));
      p.set(-(i + 1), (p.get(-(i + 1)) ?? 0) + (tie * x * lose) / (s * (win + lose)));
    });
  }
  return p;
}

/** P(value > line), given no push on an integer line. */
function over(p: Pmf, line: number) {
  let above = 0, push = 0;
  for (const [k, v] of p) {
    if (k > line) above += v;
    else if (k === line) push += v;
  }
  return push < 1 ? above / (1 - push) : 0.5;
}

function sum(p: Pmf, test: (k: number) => boolean) {
  let s = 0;
  for (const [k, v] of p) if (test(k)) s += v;
  return s;
}

/** Nearest x.5 line. */
export const halfLine = (x: number) => Math.floor(x) + 0.5;

export function expected(l: League, home: string, away: string, neutral = false): [number, number] {
  const h = l.teams.find((t) => t.team === home);
  const a = l.teams.find((t) => t.team === away);
  const adv = neutral ? 0 : l.hfa / 2;
  return [l.mu + adv + (h?.off ?? 0) + (a?.dfn ?? 0), l.mu - adv + (a?.off ?? 0) + (h?.dfn ?? 0)];
}

/** The model's own lines: fair spread, league-average total, and each period's share of them. */
export function modelLines(l: League, eh: number, ea: number): Lines {
  const sp = halfLine(-(eh - ea)), to = halfLine(l.avg_total);
  const out: Lines = { sp, to, ht: halfLine((to - sp) / 2), at: halfLine((to + sp) / 2), src: "model" };
  for (const [p, [share]] of Object.entries(l.per)) {
    const psp = halfLine(sp * share), pto = halfLine(to * share);
    Object.assign(out, { [`${p}sp`]: psp, [`${p}to`]: pto, [`${p}ht`]: halfLine((pto - psp) / 2), [`${p}at`]: halfLine((pto + psp) / 2) });
  }
  return out;
}

/** One period's markets; its margin may end level, so the result is three-way. */
function periodMarkets(p: string, [share, sm, st]: [number, number, number], eh: number, ea: number, ln: Lines): { out: Probs; margin: Pmf } {
  const mm = share * (eh - ea), mt = share * (eh + ea);
  const pm = pmf(mm, sm, mm - SPAN, mm + SPAN);
  const pt = pmf(mt, st, mt - 2 * SPAN, mt + 2 * SPAN);
  const teamSd = Math.sqrt(st ** 2 + sm ** 2) / 2;
  const ph = pmf(share * eh, teamSd, share * eh - SPAN, share * eh + SPAN), pa = pmf(share * ea, teamSd, share * ea - SPAN, share * ea + SPAN);
  const line = (k: string) => ln[`${p}${k}`] as number;
  const out: Probs = {
    [`${p}_1`]: sum(pm, (k) => k > 0), [`${p}_X`]: pm.get(0) ?? 0, [`${p}_2`]: sum(pm, (k) => k < 0),
    [`${p}_SP_H`]: over(pm, -line("sp")), [`${p}_O`]: over(pt, line("to")),
    [`${p}_HT_O`]: over(ph, line("ht")), [`${p}_AT_O`]: over(pa, line("at")),
  };
  for (const [x, y] of [["SP_H", "SP_A"], ["O", "U"], ["HT_O", "HT_U"], ["AT_O", "AT_U"]]) out[`${p}_${y}`] = 1 - out[`${p}_${x}`];
  return { out, margin: pm };
}

/** Half-time/full-time from independent halves, rescaled to agree with the moneyline. */
function htft(h1: Pmf, h2: Pmf, pHome: number): Probs {
  const joint: Probs = { HF_11: 0, HF_12: 0, HF_X1: 0, HF_X2: 0, HF_21: 0, HF_22: 0 };
  for (const [m1, p1] of h1) {
    const above = sum(h2, (k) => k > -m1), level = h2.get(-m1) ?? 0;
    const home = p1 * (above + pHome * level);
    const tag = m1 > 0 ? "1" : m1 < 0 ? "2" : "X";
    joint[`HF_${tag}1`] += home;
    joint[`HF_${tag}2`] += p1 - home;
  }
  const hs = joint.HF_11 + joint.HF_X1 + joint.HF_21, as = joint.HF_12 + joint.HF_X2 + joint.HF_22;
  for (const k of Object.keys(joint)) joint[k] *= k.endsWith("1") ? pHome / hs : (1 - pHome) / as;
  return joint;
}

export function markets(l: Pick<League, "sigma_m" | "sigma_t" | "per">, eh: number, ea: number, ln: Lines): Probs {
  const mm = eh - ea, mt = eh + ea;
  const pm = marginPmf(mm, l.sigma_m);
  const pt = pmf(mt, l.sigma_t, mt - 3 * SPAN, mt + 3 * SPAN);
  const teamSd = Math.sqrt(l.sigma_t ** 2 + l.sigma_m ** 2) / 2;
  const ph = pmf(eh, teamSd, eh - SPAN, eh + SPAN), pa = pmf(ea, teamSd, ea - SPAN, ea + SPAN);
  const out: Probs = {
    "1": sum(pm, (k) => k > 0), "2": sum(pm, (k) => k < 0),
    SP_H: over(pm, -ln.sp), TO_O: over(pt, ln.to), HT_O: over(ph, ln.ht), AT_O: over(pa, ln.at),
    WM_H6: sum(pm, (k) => k >= 6), WM_A6: sum(pm, (k) => k <= -6),
    WM_H11: sum(pm, (k) => k >= 11), WM_A11: sum(pm, (k) => k <= -11), WM_C5: sum(pm, (k) => Math.abs(k) <= 5),
  };
  for (const [a, b] of [["SP_H", "SP_A"], ["TO_O", "TO_U"], ["HT_O", "HT_U"], ["AT_O", "AT_U"]]) out[b] = 1 - out[a];
  const margins: Record<string, Pmf> = {};
  for (const [p, params] of Object.entries(l.per)) {
    const r = periodMarkets(p, params, eh, ea, ln);
    Object.assign(out, r.out);
    margins[p] = r.margin;
  }
  if (margins.H1 && margins.H2) Object.assign(out, htft(margins.H1, margins.H2, out["1"]));
  return out;
}

export function bands(sigmaM: number, eh: number, ea: number) {
  const pm = marginPmf(eh - ea, sigmaM);
  const rng: [string, number, number][] = [["H", 21, 999], ["H", 16, 20], ["H", 11, 15], ["H", 6, 10], ["H", 1, 5], ["A", 1, 5], ["A", 6, 10], ["A", 11, 15], ["A", 16, 20], ["A", 21, 999]];
  return rng.map(([s, a, b]) => ({
    band: `${s === "H" ? "Home" : "Away"} by ${b > 100 ? `${a}+` : `${a}–${b}`}`,
    p: sum(pm, (k) => (s === "H" ? k >= a && k <= b : k <= -a && k >= -b)),
  }));
}

// --------------------------------------------------------------------------- //
// In play
// --------------------------------------------------------------------------- //

/** Minutes played and total minutes (regulation plus overtimes begun) from the period and clock. */
export function gameTime(period: number, clockSecs: number, periods: number, minutes: number): { played: number; total: number } {
  const len = minutes / periods;
  if (period <= periods) return { played: (period - 1) * len + (len - clockSecs / 60), total: minutes };
  const ot = period - periods;
  return { played: minutes + (ot - 1) * 5 + (5 - clockSecs / 60), total: minutes + ot * 5 };
}

export interface InPlay {
  p: Probs;
  /** Projected final score. */
  final: [number, number];
}

/**
 * The rest of the game as Brownian motion: the pre-game expected margin and
 * total scaled to the time left, with variance shrinking in proportion. Simple,
 * and it moves the right way: a 10-point lead is worth far more with 3
 * minutes left than with 30.
 */
export function inPlay(
  f: { pts: [number, number]; sd: [number, number]; lines: Lines },
  score: [number, number],
  played: number,
  total: number,
): InPlay {
  const left = Math.max(0, total - played) / Math.max(total, 1);
  const [eh, ea] = f.pts;
  const remH = eh * left, remA = ea * left;
  const mm = score[0] - score[1] + remH - remA;
  const mt = score[0] + score[1] + remH + remA;
  const sdM = f.sd[0] * Math.sqrt(left), sdT = f.sd[1] * Math.sqrt(left);
  const pm = left > 0 ? marginPmf(mm, sdM) : new Map([[score[0] - score[1], 1]]);
  const pt = pmf(mt, sdT, mt - 3 * SPAN, mt + 3 * SPAN);
  const teamSd = Math.sqrt(sdT ** 2 + sdM ** 2) / 2;
  const ph = pmf(score[0] + remH, teamSd, score[0] + remH - SPAN, score[0] + remH + SPAN);
  const pa = pmf(score[1] + remA, teamSd, score[1] + remA - SPAN, score[1] + remA + SPAN);
  const ln = f.lines;
  const p: Probs = {
    "1": sum(pm, (k) => k > 0), "2": sum(pm, (k) => k < 0),
    SP_H: over(pm, -ln.sp), TO_O: over(pt, ln.to), HT_O: over(ph, ln.ht), AT_O: over(pa, ln.at),
    WM_H6: sum(pm, (k) => k >= 6), WM_A6: sum(pm, (k) => k <= -6),
    WM_H11: sum(pm, (k) => k >= 11), WM_A11: sum(pm, (k) => k <= -11), WM_C5: sum(pm, (k) => Math.abs(k) <= 5),
  };
  for (const [a, b] of [["SP_H", "SP_A"], ["TO_O", "TO_U"], ["HT_O", "HT_U"], ["AT_O", "AT_U"]]) p[b] = 1 - p[a];
  return { p, final: [score[0] + remH, score[1] + remA] };
}

/** [periods, minutes] per league; NCAA men's plays two halves, the NBA and G League 48 minutes. */
const CLOCK: Record<string, [number, number]> = { NBA: [4, 48], GLG: [4, 48], NCAAM: [2, 40] };
export const gameClock = (league: string) => CLOCK[league] ?? [4, 40];

/** In-play probabilities for a predicted game from the live score and clock. */
export function liveState(f: { league: string; pts: [number, number]; sd: [number, number]; lines: Lines }, e: Pick<LiveEvent, "period" | "clock" | "score" | "state">): InPlay {
  const [periods, minutes] = gameClock(f.league);
  const t = gameTime(Math.max(1, e.period), e.clock, periods, minutes);
  return inPlay(f, e.score, e.state === "post" ? t.total : t.played, t.total);
}

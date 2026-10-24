import { PRICED } from "./format";
import type { FixtureSlim } from "./types";

export interface Candidate {
  f: FixtureSlim;
  key: string;
  p: number;
  /** Bookmaker odds where published, otherwise the model's fair odds. */
  odds: number;
  fair: boolean;
}

/** Markets the generator and daily bets choose from. */
export const PICK_MARKETS = [
  "1", "2", "SP_H", "SP_A", "TO_O", "TO_U", "HT_O", "HT_U", "AT_O", "AT_U", "WM_H6", "WM_A6", "WM_C5",
  "H1_1", "H1_2", "H1_SP_H", "H1_SP_A", "H1_O", "H1_U", "H2_1", "H2_2", "H2_O", "H2_U",
  "Q1_1", "Q1_2", "Q1_O", "Q1_U", "Q4_O", "Q4_U", "HF_11", "HF_22",
];

export function candidate(f: FixtureSlim, key: string): Candidate | null {
  const p = f.p[key];
  if (p == null || p <= 0) return null;
  const book = PRICED.has(key) ? f.odds?.[key] : null;
  return { f, key, p, odds: book ?? 1 / p, fair: !book };
}

export interface Acca {
  legs: Candidate[];
  odds: number;
  /** Chance every leg wins, treating games as independent. */
  p: number;
}

/** Greedy accumulator: the likeliest pick per game within the bands, spread across leagues. */
export function buildAcca(fixtures: FixtureSlim[], opts: { legs: number; keys: string[]; minOdds: number; maxOdds: number; minP?: number; maxP?: number }): Acca {
  const cands: Candidate[] = [];
  for (const f of fixtures) {
    let best: Candidate | null = null;
    for (const k of opts.keys) {
      const c = candidate(f, k);
      if (!c || c.odds < opts.minOdds || c.odds > opts.maxOdds) continue;
      if (opts.minP != null && c.p < opts.minP) continue;
      if (opts.maxP != null && c.p > opts.maxP) continue;
      if (!best || c.p > best.p) best = c;
    }
    if (best) cands.push(best);
  }
  cands.sort((a, b) => b.p - a.p);
  const legs: Candidate[] = [];
  const leagues = new Map<string, number>();
  // Few basketball leagues play on a given day, so allow two legs per league before mixing is forced.
  for (const c of cands) {
    if (legs.length >= opts.legs) break;
    if ((leagues.get(c.f.league) ?? 0) >= 2 && cands.length > opts.legs * 2) continue;
    legs.push(c);
    leagues.set(c.f.league, (leagues.get(c.f.league) ?? 0) + 1);
  }
  return { legs, odds: legs.reduce((s, c) => s * c.odds, 1), p: legs.reduce((s, c) => s * c.p, 1) };
}

const DAILY_KEYS = ["1", "2", "SP_H", "SP_A", "TO_O", "TO_U", "WM_H6", "WM_A6"];

export function dailyBets(fixtures: FixtureSlim[]) {
  return {
    double: buildAcca(fixtures, { legs: 2, keys: DAILY_KEYS, minOdds: 1.25, maxOdds: 1.6 }),
    risk: buildAcca(fixtures, { legs: 3, keys: DAILY_KEYS, minOdds: 1.4, maxOdds: 2.1 }),
  };
}

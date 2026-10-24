import { ODDS_KEY, prob } from "./format";
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
  "1", "X", "2", "1X", "X2", "12", "O1.5", "O2.5", "O3.5", "U1.5", "U2.5", "U3.5", "BTTS_Y", "BTTS_N",
  "H_O0.5", "A_O0.5", "HT_O0.5", "HT_O1.5", "2H_O0.5", "2H_O1.5", "C_O8.5", "C_O9.5", "C_U9.5", "C_U10.5",
];

export function candidate(f: FixtureSlim, key: string): Candidate | null {
  const p = prob(f.p, key);
  if (p == null || p <= 0) return null;
  const ok = ODDS_KEY[key];
  const book = ok ? f.odds?.[ok] : null;
  return { f, key, p, odds: book ?? 1 / p, fair: !book };
}

export interface Acca {
  legs: Candidate[];
  odds: number;
  /** Chance every leg wins, treating matches as independent. */
  p: number;
}

const acca = (legs: Candidate[]): Acca => ({
  legs,
  odds: legs.reduce((s, c) => s * c.odds, 1),
  p: legs.reduce((s, c) => s * c.p, 1),
});

/**
 * Greedy accumulator: the likeliest picks whose single odds fall in range,
 * at most one per match and one per league so legs don't move together.
 */
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
  const leagues = new Set<string>();
  for (const c of cands) {
    if (legs.length >= opts.legs) break;
    if (leagues.has(c.f.league) && cands.length > opts.legs * 2) continue;
    legs.push(c);
    leagues.add(c.f.league);
  }
  return acca(legs);
}

const DAILY_KEYS = ["1", "2", "1X", "X2", "O1.5", "O2.5", "U3.5", "BTTS_Y", "H_O0.5", "A_O0.5"];

/** BetMines-style daily bets: a safer double and a three-leg "risk" at bigger odds. */
export function dailyBets(fixtures: FixtureSlim[]) {
  return {
    double: buildAcca(fixtures, { legs: 2, keys: DAILY_KEYS, minOdds: 1.25, maxOdds: 1.6 }),
    risk: buildAcca(fixtures, { legs: 3, keys: DAILY_KEYS, minOdds: 1.4, maxOdds: 2.1 }),
  };
}

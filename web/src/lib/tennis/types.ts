import type { LiveState } from "../types";

// --------------------------------------------------------------------------- //
// Written by `python -m footballseer tennis run` into public/data/tennis/
// --------------------------------------------------------------------------- //

export type Tour = "ATP" | "WTA";

export interface RatedPlayer {
  /** ESPN athlete id. */
  id: string;
  name: string;
  tour: Tour;
  elo: number;
  /** Matches rated. */
  n: number;
  /** Last match, YYYY-MM-DD. */
  last: string;
  /** Last five results, newest first: "WWLWL". */
  form: string;
  rank: number;
}

export interface Ratings {
  as_of: string;
  matches: number;
  from: string;
  /** Multiplier on the Elo gap that makes the prices honest (fitted before the backtest window). */
  scale: number;
  players: RatedPlayer[];
}

export interface Scores {
  n: number;
  accuracy: number;
  logloss: number;
  brier: number;
  calibration: { bin: number; n: number; predicted: number; actual: number }[];
}

export interface Backtest {
  from: string | null;
  to: string | null;
  overall: Scores | null;
  tours: Partial<Record<Tour, Scores>>;
}

// --------------------------------------------------------------------------- //
// Live and upcoming matches, served by /api/tennis/feed
// --------------------------------------------------------------------------- //

export interface TennisMatch {
  /** "sr:match:N" from SportyBet, or "ls:N" for a LiveScore-only result. */
  id: string;
  /** "ATP", "WTA", "ATP Challenger", "ITF Men"... */
  category: string;
  tournament: string;
  doubles: boolean;
  state: LiveState;
  /** "Set 2", "Final", "Ret." */
  status: string;
  start: string;
  players: [string, string];
  /** Sets won. */
  sets: [number, number] | null;
  /** Games per set. */
  games: [number, number][];
  /** Points in the current game. */
  point: [string, string] | null;
  serving: 0 | 1 | null;
  winner: 0 | 1 | null;
  bestOf: 3 | 5;
  /** The bookmaker's fair chances and prices, SportyBet. */
  market: [number, number] | null;
  odds: [number, number] | null;
  /** Our pre-match chances, when both players are rated. */
  model: { p: [number, number]; elo: [number, number]; rank: [number, number] } | null;
}

export interface TennisFeed {
  updated: string;
  source: string;
  matches: TennisMatch[];
}

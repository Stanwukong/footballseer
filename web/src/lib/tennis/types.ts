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
  /** Three-letter code, "ITA". */
  country: string;
  elo: number;
  /** Matches rated. */
  n: number;
  /** Last match, YYYY-MM-DD. */
  last: string;
  /** Last five results, newest first: "WWLWL". */
  form: string;
  /** Highest rating after 20 matches, and when. */
  peak: number | null;
  peak_day: string | null;
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

/** [won, lost] */
export type WL = [number, number];

export type Surface = "hard" | "clay" | "grass";

/** A listed player's record over the rated history; "year" is the last 365 days. Written to players.json. */
export interface PlayerStats {
  all: WL;
  year: WL;
  /** Grand Slam matches. */
  slams: WL;
  /** Against players now in the top 10 and top 50 of their tour. */
  top10: WL;
  top50: WL;
  /** Last year, by whether the model made them favourite before the match. */
  favourite: WL;
  underdog: WL;
  /** Sets, games, tiebreaks and deciding sets exclude retirements. */
  sets: WL;
  games: WL;
  tiebreaks: WL;
  deciders: WL;
  /** Match record after winning, and after losing, the first set. */
  won_first: WL;
  lost_first: WL;
  /** Wins in straight sets, and wins that dropped a set. */
  straight: WL;
  surface: Record<Surface, WL>;
  /** Matches lost by retiring. */
  retired: number;
  /** Wins over the last year above (+) or below what the model's prices expected. */
  vs_model: number | null;
  /** "W4": four wins in a row. */
  streak: string;
}

export interface PlayersFile {
  as_of: string;
  players: Record<string, PlayerStats>;
}

/** [date, event, round, p1 id, p2 id, winner (1 or 2), sets "6-4 3-6 7-6", best of, retired (1), p1 Elo, p2 Elo]; Elos before the match. */
export type MatchRow = [string, number, number, string, string, 1 | 2, string, 3 | 5, 0 | 1, number, number];

/** Every rated result, oldest first. Written to matches.json. */
export interface MatchesFile {
  /** [name, surface], indexed by MatchRow[1]. */
  events: [string, Surface][];
  rounds: string[];
  /** Every player rated, listed or not. */
  names: Record<string, string>;
  rows: MatchRow[];
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
  model: { p: [number, number]; elo: [number, number]; rank: [number, number]; ids: [string, string] } | null;
}

export interface TennisFeed {
  updated: string;
  source: string;
  matches: TennisMatch[];
}

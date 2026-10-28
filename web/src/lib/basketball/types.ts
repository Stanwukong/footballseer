// Shapes of the JSON written by pipeline/footballseer/basketball/pipeline.py.

import type { ElsewhereEvent, LiveState } from "../types";

export type Probs = Record<string, number>;

/**
 * The line each spread/totals market is priced at: the bookmaker's when we have one.
 * Periods carry their own, keyed by period: "H1sp", "Q3to", "H2ht"…
 */
export interface Lines {
  /** Home handicap: −5.5 means the home side gives 5.5 points. */
  sp: number;
  to: number;
  /** Team totals for the home and away side. */
  ht: number;
  at: number;
  /** "book": both lines from the bookmaker; "model": the model's spread and the league's average total. */
  src?: "book" | "mixed" | "model";
  [period: string]: number | string | undefined;
}

/** Points per period ("H1", "H2", "Q1"…), home then away. The second half includes overtime. */
export type PeriodScores = Record<string, [number, number]>;

export interface ValueBet {
  market: string;
  p: number;
  odds: number;
  edge: number;
}

/** [date, home, away, home points, away points], newest first. */
export type H2H = [string, string, string, number, number];

export interface Fixture {
  id: string;
  league: string;
  /** League-local date and tip-off time. */
  date: string;
  time: string;
  kickoff: string;
  home: string;
  away: string;
  neutral: boolean;
  /** Expected points [home, away]. */
  pts: [number, number];
  /** Standard deviation of the final margin and total. */
  sd: [number, number];
  lines: Lines;
  p: Probs;
  bands: { band: string; p: number }[];
  ladders: { spread: [number, number][]; total: [number, number][] };
  odds: Record<string, number | null> | null;
  value: ValueBet[];
  h2h: H2H[];
  /** Live feed key: "espnSlug/eventId" or "E|U/gameIdentifier". */
  live: string;
}

export type FixtureSlim = Omit<Fixture, "bands" | "ladders" | "h2h">;

export interface Result {
  id: string;
  source: "live" | "backtest";
  league: string;
  date: string;
  time: string | null;
  home: string;
  away: string;
  pts: [number, number];
  score: [number, number] | null;
  per: PeriodScores;
  lines: Lines;
  p: Probs;
  odds: Record<string, number | null>;
}

/** Hit counts over a set of games; half-time events use `nh1` as the denominator. */
export interface Rate {
  n: number;
  nh1?: number;
  /** Games with quarter scores, the denominator for quarter events. */
  nq?: number;
  pf?: number;
  pa?: number;
  c?: Record<string, number>;
}

export interface Trend {
  e: string;
  n: number;
  s: "all" | "home" | "away";
}

/** [date, opponent, venue (N = neutral), points for, points against, 1st-half for, 1st-half against, overtime], newest first. */
export type TeamGame = [string, string, "H" | "A" | "N", number, number, number | null, number | null, boolean];

export interface TeamStats {
  form: string;
  /** Current run, e.g. "W4". */
  streak: string;
  last: TeamGame[];
  rates: { l10: Rate; all: Rate; home: Rate; away: Rate };
  avg5: [number, number];
  trends: Trend[];
}

export type Teams = Record<string, Record<string, TeamStats>>;

/** [played, won, lost, points for, points against] */
export type TableLine = [number, number, number, number, number];

export interface StandingRow {
  team: string;
  all: TableLine;
  home: TableLine;
  away: TableLine;
  form: string;
  streak: string;
}

export interface LeagueProfile {
  n: number;
  season: string;
  total: number;
  home_pts: number;
  away_pts: number;
  /** Average winning margin. */
  margin: number;
  h1_share?: number;
  /** Share of points in each quarter. */
  q_share?: number[];
  rates: Record<string, number>;
}

export interface TeamRating {
  team: string;
  off: number;
  dfn: number;
  /** Points for and against a league-average side at a neutral site. */
  pf: number;
  pa: number;
  net: number;
}

export interface League {
  code: string;
  country: string;
  name: string;
  tier: number;
  /** Time-zone label for tip-off times, e.g. "ET". */
  tz: string;
  periods: number;
  minutes: number;
  mu: number;
  hfa: number;
  sigma_m: number;
  sigma_t: number;
  /** Period -> [share of the game's points, sd of its margin, sd of its total]. NCAA men's has halves only. */
  per: Record<string, [number, number, number]>;
  avg_total: number;
  games: number;
  last_game: string;
  fixtures: number;
  teams: TeamRating[];
  standings: StandingRow[];
  profile: LeagueProfile;
}

export type LeagueInfo = Pick<League, "code" | "country" | "name" | "tier" | "tz">;

export interface Meta {
  generated_at: string;
  as_of: string;
  leagues: number;
  fixtures: number;
  value_bets: number;
  data_source: string;
  labels: Record<string, string>;
}

export interface MarketSummary {
  brier: number;
  base_rate: number;
  calibration: { bin: number; n: number; predicted: number; actual: number }[];
  thresholds: { min_p: number; n: number; hit_rate: number | null }[];
}

export interface Summary {
  games: number;
  from: string;
  to: string;
  markets: Record<string, MarketSummary>;
  moneyline: {
    n: number;
    model_logloss: number;
    model_accuracy: number;
    margin_mae: number;
    total_mae: number;
    n_with_odds?: number;
    model_logloss_same?: number;
    market_logloss?: number;
    market_accuracy?: number;
    n_spread?: number;
    book_margin_mae?: number;
    model_margin_mae_same?: number;
    ats_hit?: number;
    n_total?: number;
    book_total_mae?: number;
    model_total_mae_same?: number;
    ou_hit?: number;
  };
  value: {
    edge_threshold: number;
    bets: number;
    profit: number;
    roi: number | null;
    by_market: Record<string, { bets: number; hit_rate: number | null; profit: number; roi: number | null }>;
  };
  leagues: { league: string; n: number; model_logloss: number; accuracy: number; margin_mae: number; market_logloss?: number; model_logloss_same?: number }[];
  recent: { id: string; league: string; date: string; home: string; away: string; score: [number, number]; p: Probs; lines: { sp: number | null; to: number | null } }[];
}

export interface TrackRecord {
  live: Summary | null;
  backtest: Summary | null;
}

/** Walk-forward predictions in columns, for the scanner. */
export interface Backtest {
  n: number;
  league: string[];
  date: string[];
  hg: number[];
  ag: number[];
  h1h: (number | null)[];
  h1a: (number | null)[];
  [col: string]: (number | null)[] | string[] | number[] | number;
}

// --------------------------------------------------------------------------- //
// Live data (ESPN, EuroLeague), served by /api/basketball/live
// --------------------------------------------------------------------------- //

export interface LiveEvent {
  /** Feed key, the same as Fixture.live. */
  id: string;
  league: string;
  fixture: string | null;
  state: LiveState;
  /** As shown: "Q3 5:42", "Half", "Final/OT". */
  status: string;
  period: number;
  /** Seconds left in the period. */
  clock: number;
  kickoff: string;
  home: string;
  away: string;
  score: [number, number];
  /** Points per period, home then away. */
  periods: [number[], number[]];
  /** Top scorer so far: [name, points] per side. */
  leaders: [[string, number] | null, [string, number] | null];
  stats: { home: Record<string, number>; away: Record<string, number> } | null;
  /** SportyBet's fair chances in play: home, away (overtime included). */
  market?: number[] | null;
}

export interface LiveFeed {
  updated: string;
  source: string;
  events: LiveEvent[];
  elsewhere?: ElsewhereEvent[];
}

export interface LiveDetail {
  event: LiveEvent;
  /** Team stats box: [label, home, away]. */
  stats: [string, string, string][];
  /** Box score: per side, [name, minutes, points, rebounds, assists]. */
  players: { side: "home" | "away"; rows: [string, string, number, number, number][] }[];
  /** Newest first. */
  plays: { period: number; clock: string; text: string; score: string }[];
}

// Shapes of the JSON written by pipeline/footballseer/pipeline.py.

import type { Sport } from "./nav";

export type Probs = Record<string, number>;

export interface ValueBet {
  market: string;
  p: number;
  odds: number;
  edge: number;
}

/** [date, home, away, home goals, away goals], newest first. */
export type H2H = [string, string, string, number, number];

export interface Fixture {
  id: string;
  league: string;
  date: string;
  time: string | null;
  home: string;
  away: string;
  xg: [number, number];
  /** Expected corners, main leagues only. */
  xc: [number, number] | null;
  p: Probs;
  scores: { score: string; p: number }[];
  matrix: number[][];
  odds: Record<string, number | null> | null;
  value: ValueBet[];
  h2h: H2H[];
  /** ESPN event, "leagueSlug/eventId", for live scores. Null when ESPN doesn't cover it. */
  espn: string | null;
}

export type FixtureSlim = Omit<Fixture, "scores" | "matrix" | "h2h">;

/** A prediction from the last seven days, for the lookback. */
export interface Result {
  id: string;
  /** "backtest" on days with no live prediction: the walk-forward replay stands in. */
  source: "live" | "backtest";
  league: string;
  date: string;
  time: string | null;
  home: string;
  away: string;
  xg: [number, number];
  /** Null until the result is in. */
  score: [number, number] | null;
  p: Probs;
  odds: Record<string, number | null>;
}

/** Hit counts over a set of matches; half-time events use `nht` as the denominator. */
export interface Rate {
  n: number;
  nht?: number;
  gf?: number;
  ga?: number;
  c?: Record<string, number>;
  /** Average corners [for, against]. */
  corners?: [number, number];
}

export interface Trend {
  e: string;
  n: number;
  s: "all" | "home" | "away";
}

/** [date, opponent, venue, goals for, goals against, HT for, HT against], newest first. */
export type TeamMatch = [string, string, "H" | "A", number, number, number | null, number | null];

export interface TeamStats {
  form: string;
  last: TeamMatch[];
  rates: { l10: Rate; all: Rate; home: Rate; away: Rate };
  avg5: [number, number];
  trends: Trend[];
}

export type Teams = Record<string, Record<string, TeamStats>>;

/** [played, won, drawn, lost, for, against, points] */
export type TableLine = [number, number, number, number, number, number, number];

export interface StandingRow {
  team: string;
  all: TableLine;
  home: TableLine;
  away: TableLine;
  form: string;
}

export interface LeagueProfile {
  n: number;
  season: string;
  goals: number;
  home_goals: number;
  away_goals: number;
  h1_share?: number;
  rates: Record<string, number>;
  corners?: number;
  yellows?: number;
  reds?: number;
}

/** Walk-forward predictions in columns, for the strategy backtester. */
export interface Backtest {
  n: number;
  league: string[];
  date: string[];
  hg: number[];
  ag: number[];
  [market: string]: (number | null)[] | string[] | number[] | number;
}

export interface TeamRating {
  team: string;
  attack: number;
  defence: number;
  xgf: number;
  xga: number;
}

export interface League {
  code: string;
  country: string;
  name: string;
  tier: number;
  mu: number;
  home_adv: number;
  rho: number;
  matches: number;
  last_match: string;
  avg_goals: number | null;
  home_win_rate: number | null;
  fixtures: number;
  teams: TeamRating[];
  standings: StandingRow[];
  profile: LeagueProfile;
}

export type LeagueInfo = Pick<League, "code" | "country" | "name" | "tier">;

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
  matches: number;
  from: string;
  to: string;
  markets: Record<string, MarketSummary>;
  one_x_two: {
    n: number;
    model_logloss: number;
    model_rps: number;
    model_accuracy: number;
    n_with_odds?: number;
    model_logloss_same?: number;
    market_logloss?: number;
    market_rps?: number;
    market_accuracy?: number;
    /** Mean per-match log-loss of model minus market (> 0: market better). */
    logloss_gap?: number;
    /** Bootstrap 95% CI [low, high] for logloss_gap. */
    logloss_gap_ci?: [number, number] | null;
  };
  value: {
    edge_threshold: number;
    bets: number;
    profit: number;
    roi: number | null;
    /** Bootstrap 95% CI [low, high] for flat-stake ROI. */
    roi_ci?: [number, number] | null;
    by_market: Record<string, {
      bets: number; hit_rate: number | null; profit: number; roi: number | null; roi_ci?: [number, number] | null;
    }>;
  };
  leagues: {
    league: string;
    n: number;
    model_logloss: number;
    accuracy: number;
    market_logloss?: number;
    model_logloss_same?: number;
  }[];
  recent: { id: string; league: string; date: string; home: string; away: string; score: string; p: Probs }[];
}

export interface TrackRecord {
  live: Summary | null;
  backtest: Summary | null;
}

// --------------------------------------------------------------------------- //
// Live data (ESPN), served by /api/live
// --------------------------------------------------------------------------- //

export type LiveState = "pre" | "in" | "post";

export interface LiveIncident {
  minute: string;
  kind: "goal" | "own-goal" | "penalty" | "missed-penalty" | "yellow" | "red" | "sub" | "period" | "other";
  side: "home" | "away" | null;
  text: string;
  player?: string;
  /** Player coming off, for substitutions. */
  playerOut?: string;
}

/** Headline team numbers from the scoreboard feed. */
export interface LiveTeamStats {
  possession?: number;
  shots?: number;
  onTarget?: number;
  corners?: number;
  fouls?: number;
}

export interface LiveEvent {
  /** "leagueSlug/eventId" */
  id: string;
  /** Our league code. */
  league: string;
  /** Our fixture id, when the pipeline linked one. */
  fixture: string | null;
  state: LiveState;
  /** Status as shown: "65'", "HT", "FT", "Postponed". */
  status: string;
  /** Minutes played, for the in-play model. */
  minute: number;
  kickoff: string;
  home: string;
  away: string;
  score: [number, number];
  red: [number, number];
  stats: { home: LiveTeamStats; away: LiveTeamStats } | null;
  incidents: LiveIncident[];
  /** SportyBet's fair chances in play: home, draw, away. */
  market?: number[] | null;
}

/** A game in play that SportyBet lists and our scoreboards don't. */
export interface ElsewhereEvent {
  id: string;
  competition: string;
  /** "74'", "HT", "Q3". */
  status: string;
  home: string;
  away: string;
  score: [number, number] | null;
  market: number[] | null;
}

export interface LiveFeed {
  updated: string;
  source: string;
  events: LiveEvent[];
  elsewhere?: ElsewhereEvent[];
}

export interface LineupPlayer {
  name: string;
  pos: string;
  jersey: string;
  subbedIn: boolean;
  subbedOut: boolean;
}

export interface LiveDetail {
  event: LiveEvent;
  /** Full stats box: [label, home, away]. */
  stats: [string, string, string][];
  timeline: LiveIncident[];
  lineups: { side: "home" | "away"; formation: string | null; starters: LineupPlayer[]; subs: LineupPlayer[] }[];
  /** Newest first. */
  commentary: { minute: string; text: string }[];
}

// --------------------------------------------------------------------------- //
// A SportyBet booking code, decoded and priced by our models: /api/booking-code
// --------------------------------------------------------------------------- //

export interface SlipLeg {
  /** "sr:match:N" */
  eventId: string;
  /** Null for a sport we don't model. */
  sport: Sport | null;
  sportName: string;
  competition: string;
  start: string;
  /** Started or finished legs are still priced, but from before the start. */
  state: "pre" | "in" | "post";
  home: string;
  away: string;
  market: string;
  pick: string;
  odds: number;
  /** The bookmaker's own chance for the pick, from SportyBet. */
  book: number | null;
  /** Our chance the pick wins, and that it's void (a draw-no-bet draw, a whole-number line landing). */
  model: { p: number; push: number } | null;
  /** Why there's no model price, or a caveat on it. */
  note: string | null;
  /** Our page for the match or the players. */
  links: { label: string; href: string }[];
  /** A line of form for context: "Elo 2302 (#1) · 54–3 this year · hard 118–9". */
  context: string[];
}

export interface Slip {
  code: string;
  country: string;
  legs: SlipLeg[];
  /** Product of the legs' odds. */
  odds: number;
}

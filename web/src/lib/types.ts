// Shapes of the JSON written by pipeline/footballseer/pipeline.py.

export type Probs = Record<string, number>;

export interface ValueBet {
  market: string;
  p: number;
  odds: number;
  edge: number;
}

export interface Fixture {
  id: string;
  league: string;
  date: string;
  time: string | null;
  home: string;
  away: string;
  xg: [number, number];
  p: Probs;
  scores: { score: string; p: number }[];
  matrix: number[][];
  odds: Record<string, number | null> | null;
  value: ValueBet[];
}

export type FixtureSlim = Omit<Fixture, "scores" | "matrix">;

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
}

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
  };
  value: {
    edge_threshold: number;
    bets: number;
    profit: number;
    roi: number | null;
    by_market: Record<string, { bets: number; hit_rate: number | null; profit: number; roi: number | null }>;
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

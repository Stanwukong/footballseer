import "server-only";

import { load } from "../data";
import type { Backtest, MatchesFile, PlayersFile, Ratings } from "./types";

// Written by `python -m footballseer tennis run` into public/data/tennis/.

export const getRatings = () => load<Ratings>("tennis/ratings.json", { as_of: "", matches: 0, from: "", scale: 1, players: [] });
export const getBacktest = () => load<Backtest>("tennis/backtest.json", { from: null, to: null, overall: null, tours: {} });
export const getPlayerStats = () => load<PlayersFile>("tennis/players.json", { as_of: "", players: {} });
export const getMatches = () => load<MatchesFile>("tennis/matches.json", { events: [], rounds: [], names: {}, rows: [] });

import "server-only";

import { load } from "../data";
import type { Backtest, Ratings } from "./types";

// Written by `python -m footballseer tennis run` into public/data/tennis/.

export const getRatings = () => load<Ratings>("tennis/ratings.json", { as_of: "", matches: 0, from: "", scale: 1, players: [] });
export const getBacktest = () => load<Backtest>("tennis/backtest.json", { from: null, to: null, overall: null, tours: {} });

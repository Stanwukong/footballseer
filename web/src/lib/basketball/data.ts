import "server-only";

import { load } from "../data";
import type { Fixture, FixtureSlim, League, LeagueInfo, Meta, Result, Teams, TrackRecord } from "./types";

// Written by `python -m footballseer basketball run` into public/data/basketball/.

export const getFixtures = () => load<Fixture[]>("basketball/fixtures.json", []);
export const getLeagues = () => load<League[]>("basketball/leagues.json", []);
export const getTeams = () => load<Teams>("basketball/teams.json", {});
export const getResults = () => load<Result[]>("basketball/results.json", []);
export const getTrackRecord = () => load<TrackRecord>("basketball/track_record.json", { live: null, backtest: null });
export const getMeta = () =>
  load<Meta>("basketball/meta.json", { generated_at: "", as_of: "", leagues: 0, fixtures: 0, value_bets: 0, data_source: "", labels: {} });

export async function getFixture(id: string) {
  return (await getFixtures()).find((f) => f.id === id);
}

export async function getSlimFixtures(): Promise<FixtureSlim[]> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (await getFixtures()).map(({ bands, ladders, h2h, ...rest }) => rest);
}

export async function getLeagueIndex(): Promise<LeagueInfo[]> {
  return (await getLeagues()).map(({ code, country, name, tier, tz }) => ({ code, country, name, tier, tz }));
}

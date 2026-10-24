import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";

import type { Fixture, FixtureSlim, League, LeagueInfo, Meta, Result, Teams, TrackRecord } from "./types";

// The pipeline writes these files and every pipeline run triggers a redeploy,
// so reads are cached for the life of the build. In development the pipeline
// rewrites them under a running server, so they're re-read within seconds.
const DIR = path.join(process.cwd(), "public", "data");

/** A pipeline JSON file under public/data; `name` may include a sport folder ("basketball/fixtures.json"). */
export async function load<T>(name: string, fallback: T): Promise<T> {
  "use cache";
  if (process.env.NODE_ENV === "development") cacheLife("seconds");
  else cacheLife("max");
  try {
    return JSON.parse(await readFile(path.join(DIR, name), "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export const getFixtures = () => load<Fixture[]>("fixtures.json", []);
export const getLeagues = () => load<League[]>("leagues.json", []);
export const getTeams = () => load<Teams>("teams.json", {});
export const getResults = () => load<Result[]>("results.json", []);
export const getTrackRecord = () => load<TrackRecord>("track_record.json", { live: null, backtest: null });
export const getMeta = () =>
  load<Meta>("meta.json", {
    generated_at: "",
    as_of: "",
    leagues: 0,
    fixtures: 0,
    value_bets: 0,
    data_source: "",
    labels: {},
  });

export async function getFixture(id: string) {
  return (await getFixtures()).find((f) => f.id === id);
}

export async function getSlimFixtures(): Promise<FixtureSlim[]> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (await getFixtures()).map(({ scores, matrix, h2h, ...rest }) => rest);
}

/** Minimal league index for client components. */
export async function getLeagueIndex(): Promise<LeagueInfo[]> {
  return (await getLeagues()).map(({ code, country, name, tier }) => ({ code, country, name, tier }));
}

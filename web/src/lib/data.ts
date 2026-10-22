import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";

import type { Fixture, FixtureSlim, League, Meta, TrackRecord } from "./types";

// The pipeline writes these files and every pipeline run triggers a redeploy,
// so reads are cached for the life of the build.
const DIR = path.join(process.cwd(), "public", "data");

async function load<T>(name: string, fallback: T): Promise<T> {
  "use cache";
  cacheLife("max");
  try {
    return JSON.parse(await readFile(path.join(DIR, name), "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export const getFixtures = () => load<Fixture[]>("fixtures.json", []);
export const getLeagues = () => load<League[]>("leagues.json", []);
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
  return (await getFixtures()).map(({ scores, matrix, ...rest }) => rest);
}

/** Minimal league index for client components. */
export async function getLeagueIndex() {
  return (await getLeagues()).map(({ code, country, name, tier }) => ({ code, country, name, tier }));
}

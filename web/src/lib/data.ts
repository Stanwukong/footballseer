import "server-only";

import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { Fixture, FixtureSlim, League, LeagueInfo, Meta, Result, Teams, TrackRecord } from "./types";

// The pipeline writes these files and every pipeline run triggers a redeploy,
// so each file is parsed once per process and kept. In development the pipeline
// rewrites them under a running server, so a file is re-read when it changes.
//
// Not "use cache": every prerendered page would decode its own copy of each
// file and then deflate all of them into that page's resume data. With a few
// MB of JSON and ~1000 pages that ran past Next's 60 s page limit and Vercel's
// 45 min build limit. A synchronous read is static to Cache Components anyway.
const DIR = path.join(process.cwd(), "public", "data");
const DEV = process.env.NODE_ENV === "development";
const files = new Map<string, { mtime: number; value: unknown }>();

/** A pipeline JSON file under public/data; `name` may include a sport folder ("basketball/fixtures.json"). */
export async function load<T>(name: string, fallback: T): Promise<T> {
  const file = path.join(DIR, name);
  let hit = files.get(name);
  if (hit && DEV && hit.mtime !== mtimeOf(file)) hit = undefined;
  if (!hit) {
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      value = undefined;
    }
    hit = { mtime: DEV ? mtimeOf(file) : 0, value };
    files.set(name, hit);
  }
  return (hit.value ?? fallback) as T;
}

function mtimeOf(file: string) {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return -1;
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

import "server-only";

import type { LiveState } from "../types";
import { cached, getJson } from "../live";
import { getFixtures } from "./data";
import type { LiveDetail, LiveEvent, LiveFeed } from "./types";

/*
 * Live basketball: ESPN's public scoreboards for the North American leagues
 * and the NBL, and the EuroLeague's own feeds for EuroLeague and EuroCup.
 * Same caching as football (lib/live.ts): any number of polling browsers cost
 * one upstream fetch every 20 seconds.
 */

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball";
const EL_SCHEDULE = "https://api-live.euroleague.net/v2/competitions";
const EL_LIVE = "https://feeds.incrowdsports.com/provider/euroleague-feeds/v2/competitions";
const FEED_TTL = 20_000;
const DETAIL_TTL = 15_000;

/** Feed prefix -> our league code. Mirrors pipeline/footballseer/basketball/leagues.py. */
export const PREFIX_TO_CODE: Record<string, string> = {
  nba: "NBA", wnba: "WNBA", "mens-college-basketball": "NCAAM", "nba-development": "GLG", nbl: "NBL", E: "EL", U: "ECUP",
};
const PERIODS: Record<string, number> = { NCAAM: 2 };
const EUROLEAGUE = new Set(["E", "U"]);

// ESPN and EuroLeague payloads are large and loosely typed; we read only what we need.
/* eslint-disable @typescript-eslint/no-explicit-any */

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
};

function clockSecs(v: unknown): number {
  if (typeof v === "number") return v;
  const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(String(v ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function periodName(period: number, code: string) {
  const periods = PERIODS[code] ?? 4;
  if (period > periods) return period === periods + 1 ? "OT" : `${period - periods}OT`;
  return periods === 2 ? `H${period}` : `Q${period}`;
}

const STAT_KEYS: Record<string, string> = {
  fieldGoalPct: "FG%", threePointPct: "3P%", threePointFieldGoalPct: "3P%", freeThrowPct: "FT%", rebounds: "REB", assists: "AST",
};

function espnEvent(e: any, slug: string, fixtureOf: Map<string, string>): LiveEvent | null {
  const comp = e?.competitions?.[0];
  const h = comp?.competitors?.find((c: any) => c.homeAway === "home");
  const a = comp?.competitors?.find((c: any) => c.homeAway === "away");
  if (!comp || !h || !a) return null;
  const st = comp.status ?? e.status;
  const state = (st?.type?.state ?? "pre") as LiveState;
  const code = PREFIX_TO_CODE[slug];
  const period = num(st?.period) ?? 0;
  const name: string = st?.type?.name ?? "";
  const status =
    state === "in"
      ? name === "STATUS_HALFTIME" ? "Half" : name === "STATUS_END_PERIOD" ? `End ${periodName(period, code)}` : `${periodName(period, code)} ${st?.displayClock ?? ""}`.trim()
      : (st?.type?.shortDetail ?? "");
  const leader = (c: any): [string, number] | null => {
    const l = (c.leaders ?? []).find((x: any) => x.name === "points")?.leaders?.[0];
    return l ? [l.athlete?.shortName ?? l.athlete?.displayName ?? "", num(l.value) ?? 0] : null;
  };
  const stats = (c: any) => {
    const out: Record<string, number> = {};
    for (const s of c.statistics ?? []) if (STAT_KEYS[s.name] && num(s.displayValue) != null) out[STAT_KEYS[s.name]] = num(s.displayValue)!;
    return out;
  };
  const id = `${slug}/${e.id}`;
  return {
    id, league: code, fixture: fixtureOf.get(id) ?? null, state, status,
    period, clock: num(st?.clock) ?? 0, kickoff: e.date ?? comp.date,
    home: h.team?.displayName ?? "", away: a.team?.displayName ?? "",
    score: [num(h.score) ?? 0, num(a.score) ?? 0],
    periods: [(h.linescores ?? []).map((x: any) => num(x.value ?? x.displayValue) ?? 0), (a.linescores ?? []).map((x: any) => num(x.value ?? x.displayValue) ?? 0)],
    leaders: [leader(h), leader(a)],
    stats: state !== "pre" && (h.statistics ?? []).length ? { home: stats(h), away: stats(a) } : null,
  };
}

/** EuroLeague live game (incrowd feed). Status is "confirmed" before, "result" after. */
function elEvent(g: any, comp: string, fixtureOf: Map<string, string>): LiveEvent | null {
  if (!g?.identifier || !g.home || !g.away) return null;
  const s = String(g.status ?? "").toLowerCase();
  const state: LiveState = s === "result" ? "post" : s === "confirmed" || s === "" || s === "scheduled" ? "pre" : "in";
  const quarters = (side: any) => {
    const q = side?.quarters ?? {};
    return ["q1", "q2", "q3", "q4", "ot1", "ot2", "ot3"].map((k) => q[k]).filter((v) => v != null).map(Number);
  };
  const period = num(g.quarter) ?? quarters(g.home).filter((x) => x > 0).length;
  const id = `${comp}/${g.identifier}`;
  return {
    id, league: PREFIX_TO_CODE[comp], fixture: fixtureOf.get(id) ?? null, state,
    status: state === "post" ? "Final" : state === "in" ? `${periodName(period, "EL")} ${g.remainingTime ?? ""}`.trim() : "",
    period, clock: clockSecs(g.remainingTime), kickoff: g.date,
    home: g.home.name ?? "", away: g.away.name ?? "",
    score: [num(g.home.score) ?? 0, num(g.away.score) ?? 0],
    periods: [quarters(g.home), quarters(g.away)],
    leaders: [null, null], stats: null,
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** ESPN files games under US Eastern dates, so late UTC tip-offs sit on the previous day. */
function feedDates(now = new Date()) {
  const dates = [ymd(now)];
  if (now.getUTCHours() < 10) dates.push(ymd(new Date(now.getTime() - 86_400_000)));
  return dates;
}

async function fixtureIndex() {
  const fixtures = await getFixtures();
  const fixtureOf = new Map<string, string>();
  for (const f of fixtures) fixtureOf.set(f.live, f.id);
  return { fixtures, fixtureOf };
}

/** EuroLeague: the rounds being played around today, from the season schedule (refreshed hourly). */
async function elRounds(comp: string, now: Date): Promise<{ season: string; rounds: number[] }> {
  const year = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const season = `${comp}${year}`;
  const games = await cached(`el-schedule:${season}`, 3_600_000, async () => {
    const d = (await getJson(`${EL_SCHEDULE}/${comp}/seasons/${season}/games`)) as any;
    return ((d?.data ?? d) as any[]).map((g) => ({ round: Number(g.round), at: Date.parse(g.utcDate) }));
  });
  const rounds = new Set(games.filter((g) => Math.abs(g.at - now.getTime()) < 18 * 3_600_000).map((g) => g.round));
  return { season, rounds: [...rounds] };
}

/** Every game today in the leagues we cover, live ones first. */
export function getLiveFeed(): Promise<LiveFeed> {
  return cached("bb-feed", FEED_TTL, async () => {
    const { fixtures, fixtureOf } = await fixtureIndex();
    const now = new Date();
    const near = new Set(fixtures.filter((f) => Math.abs(Date.parse(f.kickoff) - now.getTime()) < 2 * 86_400_000).map((f) => f.live.split("/")[0]));
    const prefixes = near.size ? [...near] : Object.keys(PREFIX_TO_CODE);

    const jobs: Promise<LiveEvent[]>[] = [];
    for (const p of prefixes) {
      if (EUROLEAGUE.has(p)) {
        jobs.push(
          elRounds(p, now).then(({ season, rounds }) =>
            Promise.all(rounds.map((r) => getJson(`${EL_LIVE}/${p}/seasons/${season}/games?roundNumber=${r}`))).then((pages) =>
              pages.flatMap((d: any) => (d?.data ?? []).map((g: any) => elEvent(g, p, fixtureOf))).filter((e): e is LiveEvent => !!e && Math.abs(Date.parse(e.kickoff) - now.getTime()) < 18 * 3_600_000),
            ),
          ),
        );
      } else {
        const extra = p === "mens-college-basketball" ? "&groups=50&limit=500" : "";
        for (const d of feedDates(now)) {
          jobs.push(getJson(`${ESPN}/${p}/scoreboard?dates=${d}${extra}`).then((data: any) => (data?.events ?? []).map((e: any) => espnEvent(e, p, fixtureOf)).filter(Boolean)));
        }
      }
    }
    const pages = await Promise.allSettled(jobs);
    if (pages.length && pages.every((p) => p.status === "rejected")) throw new Error("live sources unreachable");
    const seen = new Set<string>();
    const events: LiveEvent[] = [];
    for (const p of pages) {
      if (p.status !== "fulfilled") continue;
      for (const e of p.value) {
        // NCAA has hundreds of games a day; keep the ones we predicted, plus anything live elsewhere.
        if (seen.has(e.id) || (e.league === "NCAAM" && !e.fixture)) continue;
        seen.add(e.id);
        events.push(e);
      }
    }
    const rank: Record<LiveState, number> = { in: 0, post: 1, pre: 2 };
    events.sort((a, b) => rank[a.state] - rank[b.state] || a.kickoff.localeCompare(b.kickoff));
    return { updated: now.toISOString(), source: "ESPN · EuroLeague", events };
  });
}

/** One game in full. ESPN games get the box score and play-by-play; EuroLeague games the quarter scores. */
export function getLiveDetail(prefix: string, eventId: string): Promise<LiveDetail> {
  return cached(`bb-detail:${prefix}/${eventId}`, DETAIL_TTL, async () => {
    const { fixtureOf } = await fixtureIndex();
    if (EUROLEAGUE.has(prefix)) {
      const feed = await getLiveFeed();
      const event = feed.events.find((e) => e.id === `${prefix}/${eventId}`);
      if (!event) throw new Error("not in today's feed");
      return { event, stats: [], players: [], plays: [] };
    }
    const d = (await getJson(`${ESPN}/${prefix}/summary?event=${eventId}`)) as any;
    const comp = d?.header?.competitions?.[0];
    const event = espnEvent({ id: eventId, date: comp?.date, competitions: [comp] }, prefix, fixtureOf);
    if (!event) throw new Error("bad summary");

    const box = (d.boxscore?.teams ?? []) as any[];
    const side = (s: "home" | "away") => {
      const t = box.find((x) => x.homeAway === s) ?? box.find((x) => x.team?.displayName === event[s]) ?? box[s === "home" ? 1 : 0];
      return Object.fromEntries((t?.statistics ?? []).map((x: any) => [x.label ?? x.name, String(x.displayValue)]));
    };
    const hs = side("home"), as = side("away");
    const stats: [string, string, string][] = Object.keys(hs).filter((k) => as[k] != null && !/Technical|Flagrant|Team Turnovers/.test(k)).map((k) => [k, hs[k], as[k]]);

    const players = ((d.boxscore?.players ?? []) as any[]).map((p) => {
      const s = p.statistics?.[0] ?? {};
      const keys: string[] = s.keys ?? [];
      const at = (row: any, k: string) => row.stats?.[keys.indexOf(k)];
      const rows: [string, string, number, number, number][] = ((s.athletes ?? []) as any[])
        .filter((r) => r.stats?.length && !r.didNotPlay)
        .map((r) => [r.athlete?.shortName ?? r.athlete?.displayName ?? "", String(at(r, "minutes") ?? "–"), num(at(r, "points")) ?? 0, num(at(r, "rebounds")) ?? 0, num(at(r, "assists")) ?? 0] as [string, string, number, number, number])
        .sort((x, y) => y[2] - x[2]);
      const isHome = p.team?.displayName === event.home;
      return { side: (isHome ? "home" : "away") as "home" | "away", rows };
    });

    const plays = ((d.plays ?? []) as any[])
      .filter((p) => p.scoringPlay || /timeout|end of|start of/i.test(p.text ?? ""))
      .slice(-40)
      .reverse()
      .map((p) => ({ period: num(p.period?.number) ?? 0, clock: p.clock?.displayValue ?? "", text: p.text ?? "", score: `${p.homeScore ?? ""}-${p.awayScore ?? ""}` }));

    return { event, stats, players, plays };
  });
}

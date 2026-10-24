import "server-only";

import { getFixtures } from "./data";
import type { LiveDetail, LiveEvent, LiveFeed, LiveIncident, LiveState, LiveTeamStats, LineupPlayer } from "./types";

/*
 * Live scores from ESPN's public site API (no key). SofaScore was the first
 * choice, but it refuses non-browser clients; ESPN serves the same essentials:
 * state, minute, score, goals and cards, team stats, line-ups and commentary.
 *
 * Responses are cached in memory for a few seconds and the route handlers add
 * CDN cache headers, so any number of polling browsers cost one upstream fetch.
 */

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const FEED_TTL = 20_000;
const DETAIL_TTL = 15_000;

/** ESPN league slug -> our league code. Mirrors pipeline/footballseer/espn.py. */
export const SLUG_TO_CODE: Record<string, string> = {
  "eng.1": "E0", "eng.2": "E1", "eng.3": "E2", "eng.4": "E3", "eng.5": "EC",
  "sco.1": "SC0", "sco.2": "SC1", "sco.3": "SC2", "sco.4": "SC3",
  "ger.1": "D1", "ger.2": "D2", "ita.1": "I1", "ita.2": "I2", "esp.1": "SP1", "esp.2": "SP2",
  "fra.1": "F1", "fra.2": "F2", "ned.1": "N1", "bel.1": "B1", "por.1": "P1", "tur.1": "T1", "gre.1": "G1",
  "arg.1": "ARG", "aut.1": "AUT", "bra.1": "BRA", "chn.1": "CHN", "den.1": "DNK", "fin.1": "FIN",
  "irl.1": "IRL", "jpn.1": "JPN", "mex.1": "MEX", "nor.1": "NOR", "rou.1": "ROU", "rus.1": "RUS",
  "swe.1": "SWE", "sui.1": "SWZ", "usa.1": "USA",
};

const MAX_STALE = 5 * 60_000;
const cache = new Map<string, { at: number; value?: unknown; pending?: Promise<unknown> }>();

/**
 * Stale-while-revalidate memo. Fresh for `ttl` ms; after that the last value is
 * served at once while one background request refreshes it (an ESPN fan-out
 * takes seconds). Only the first call, or one after MAX_STALE, waits.
 * A failed refresh keeps serving the last good value.
 */
export function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const entry = cache.get(key) ?? { at: 0 };
  cache.set(key, entry);
  const age = Date.now() - entry.at;
  const refresh = () =>
    (entry.pending ??= load()
      .then((v) => {
        entry.value = v;
        entry.at = Date.now();
        return v;
      })
      .finally(() => {
        entry.pending = undefined;
      }));
  if (entry.value !== undefined && age < ttl) return Promise.resolve(entry.value as T);
  if (entry.value !== undefined && age < MAX_STALE) {
    refresh().catch(() => {});
    return Promise.resolve(entry.value as T);
  }
  return refresh() as Promise<T>;
}

export async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "footballseer/0.1" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// ESPN payloads are large and loosely typed; we read only what we need.
/* eslint-disable @typescript-eslint/no-explicit-any */

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
};

function kindOf(type: string, d: any): LiveIncident["kind"] {
  const t = type.toLowerCase();
  if (d?.ownGoal || t.includes("own goal")) return "own-goal";
  if (t.includes("penalty") && (t.includes("missed") || t.includes("saved") || t.includes("woodwork"))) return "missed-penalty";
  if (t.includes("penalty") && (d?.scoringPlay || t.includes("scored"))) return "penalty";
  if (d?.scoringPlay || t.startsWith("goal")) return "goal";
  if (d?.redCard || t.includes("red card")) return "red";
  if (d?.yellowCard || t.includes("yellow")) return "yellow";
  if (t.includes("substitution")) return "sub";
  if (["kickoff", "halftime", "start 2nd half", "end regular time", "full time"].some((x) => t.includes(x))) return "period";
  return "other";
}

function sideOf(teamId: string | undefined, teamName: string | undefined, ids: { home: string; away: string }, names: { home: string; away: string }) {
  if (teamId) return teamId === ids.home ? "home" : teamId === ids.away ? "away" : null;
  if (teamName) return teamName === names.home ? "home" : teamName === names.away ? "away" : null;
  return null;
}

/** Display status: the clock in play, otherwise a short state label. */
function statusText(st: any): string {
  const name: string = st?.type?.name ?? "";
  if (name === "STATUS_HALFTIME") return "HT";
  if (name === "STATUS_FULL_TIME" || name === "STATUS_FINAL") return "FT";
  if (name.includes("PEN") || name.includes("AET")) return st?.type?.shortDetail ?? "FT";
  if (st?.type?.state === "in") return st?.displayClock ?? st?.type?.shortDetail ?? "Live";
  return st?.type?.shortDetail ?? "";
}

function teamStats(c: any): LiveTeamStats {
  const s = Object.fromEntries((c?.statistics ?? []).map((x: any) => [x.name, num(x.displayValue)]));
  return { possession: s.possessionPct, shots: s.totalShots, onTarget: s.shotsOnTarget, corners: s.wonCorners, fouls: s.foulsCommitted };
}

function parseEvent(e: any, slug: string, fixtureOf: Map<string, string>): LiveEvent | null {
  const comp = e?.competitions?.[0];
  const h = comp?.competitors?.find((c: any) => c.homeAway === "home");
  const a = comp?.competitors?.find((c: any) => c.homeAway === "away");
  if (!comp || !h || !a) return null;
  const st = comp.status ?? e.status;
  const state = (st?.type?.state ?? "pre") as LiveState;
  const ids = { home: String(h.team?.id), away: String(a.team?.id) };
  const names = { home: h.team?.displayName ?? "", away: a.team?.displayName ?? "" };
  const incidents: LiveIncident[] = (comp.details ?? []).map((d: any) => ({
    minute: d.clock?.displayValue ?? "",
    kind: kindOf(d.type?.text ?? "", d),
    side: sideOf(d.team?.id ? String(d.team.id) : undefined, undefined, ids, names),
    text: d.type?.text ?? "",
    player: d.athletesInvolved?.[0]?.displayName,
  }));
  const red: [number, number] = [0, 0];
  for (const i of incidents) if (i.kind === "red") red[i.side === "home" ? 0 : 1]++;
  const id = `${slug}/${e.id}`;
  const hasStats = (h.statistics ?? []).length > 0 && state !== "pre";
  return {
    id,
    league: SLUG_TO_CODE[slug],
    fixture: fixtureOf.get(id) ?? null,
    state,
    status: statusText(st),
    minute: Math.round((num(st?.clock) ?? 0) / 60),
    kickoff: e.date,
    home: names.home,
    away: names.away,
    score: [num(h.score) ?? 0, num(a.score) ?? 0],
    red,
    stats: hasStats ? { home: teamStats(h), away: teamStats(a) } : null,
    incidents: incidents.filter((i) => i.kind !== "other" && i.kind !== "period"),
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** ESPN files matches under US Eastern dates, so late UTC kick-offs sit on the previous day. */
function feedDates(now = new Date()) {
  const dates = [ymd(now)];
  if (now.getUTCHours() < 8) dates.push(ymd(new Date(now.getTime() - 86_400_000)));
  return dates;
}

async function fixtureIndex() {
  const fixtures = await getFixtures();
  const fixtureOf = new Map<string, string>();
  for (const f of fixtures) if (f.espn) fixtureOf.set(f.espn, f.id);
  return { fixtures, fixtureOf };
}

/** Every match today in leagues we cover, live ones first. */
export function getLiveFeed(): Promise<LiveFeed> {
  return cached("feed", FEED_TTL, async () => {
    const { fixtures, fixtureOf } = await fixtureIndex();
    // Only leagues with a fixture around today; all of them if the pipeline data is stale.
    const now = Date.now();
    const near = new Set(
      fixtures
        .filter((f) => f.espn && Math.abs(Date.parse(f.date) - now) < 2 * 86_400_000)
        .map((f) => f.espn!.split("/")[0]),
    );
    const slugs = near.size ? [...near] : Object.keys(SLUG_TO_CODE);
    const jobs = slugs.flatMap((slug) => feedDates().map((d) => ({ slug, d })));
    const pages = await Promise.allSettled(jobs.map((j) => getJson(`${BASE}/${j.slug}/scoreboard?dates=${j.d}`).then((data) => ({ ...j, data }))));
    const seen = new Set<string>();
    const events: LiveEvent[] = [];
    for (const p of pages) {
      if (p.status !== "fulfilled") continue;
      for (const raw of (p.value.data as any)?.events ?? []) {
        const ev = parseEvent(raw, p.value.slug, fixtureOf);
        if (ev && !seen.has(ev.id)) {
          seen.add(ev.id);
          events.push(ev);
        }
      }
    }
    const rank: Record<LiveState, number> = { in: 0, post: 1, pre: 2 };
    events.sort((a, b) => rank[a.state] - rank[b.state] || a.kickoff.localeCompare(b.kickoff));
    if (pages.every((p) => p.status === "rejected")) throw new Error("ESPN unreachable");
    return { updated: new Date().toISOString(), source: "ESPN", events };
  });
}

const STAT_LABELS: [string, string][] = [
  ["possessionPct", "Possession %"], ["totalShots", "Shots"], ["shotsOnTarget", "Shots on target"],
  ["blockedShots", "Blocked shots"], ["wonCorners", "Corners"], ["offsides", "Offsides"], ["foulsCommitted", "Fouls"],
  ["yellowCards", "Yellow cards"], ["redCards", "Red cards"], ["saves", "Saves"], ["totalPasses", "Passes"],
  ["accuratePasses", "Accurate passes"], ["totalTackles", "Tackles"], ["interceptions", "Interceptions"],
  ["totalCrosses", "Crosses"], ["effectiveClearance", "Clearances"],
];

function player(p: any): LineupPlayer {
  return {
    name: p.athlete?.displayName ?? "",
    pos: p.position?.abbreviation ?? "",
    jersey: p.jersey ?? "",
    subbedIn: !!p.subbedIn,
    subbedOut: !!p.subbedOut,
  };
}

/** Full match detail: stats box, timeline, line-ups and commentary. */
export function getLiveDetail(slug: string, eventId: string): Promise<LiveDetail> {
  return cached(`detail:${slug}/${eventId}`, DETAIL_TTL, async () => {
    const [{ fixtureOf }, d] = await Promise.all([fixtureIndex(), getJson(`${BASE}/${slug}/summary?event=${eventId}`) as Promise<any>]);
    const comp = d?.header?.competitions?.[0];
    const ev = parseEvent({ id: eventId, date: comp?.date, competitions: [{ ...comp, details: [] }] }, slug, fixtureOf);
    if (!ev) throw new Error("bad summary");
    const names = { home: ev.home, away: ev.away };
    const ids = { home: "", away: "" };
    const timeline: LiveIncident[] = (d.keyEvents ?? [])
      .map((k: any) => ({
        minute: k.clock?.displayValue ?? "",
        kind: kindOf(k.type?.text ?? "", k),
        side: sideOf(undefined, k.team?.displayName, ids, names),
        text: k.text ?? k.type?.text ?? "",
        player: k.participants?.[0]?.athlete?.displayName,
        playerOut: k.participants?.[1]?.athlete?.displayName,
      }))
      .filter((i: LiveIncident) => i.kind !== "other");

    const box = (d.boxscore?.teams ?? []) as any[];
    const bySide = (side: "home" | "away") => {
      const t = box.find((x) => x.team?.displayName === names[side]) ?? box[side === "home" ? 0 : 1];
      return Object.fromEntries((t?.statistics ?? []).map((s: any) => [s.name, s.displayValue as string]));
    };
    const hs = bySide("home"), as = bySide("away");
    const stats: [string, string, string][] = STAT_LABELS.filter(([k]) => hs[k] != null || as[k] != null).map(([k, label]) => [label, hs[k] ?? "–", as[k] ?? "–"]);

    // Goals and cards from the timeline fill in what the header lacks.
    ev.incidents = timeline.filter((i) => ["goal", "own-goal", "penalty", "red", "yellow"].includes(i.kind));
    ev.red = [0, 0];
    for (const i of ev.incidents) if (i.kind === "red") ev.red[i.side === "home" ? 0 : 1]++;
    if (stats.length) {
      const pick = (s: Record<string, string>): LiveTeamStats => ({ possession: num(s.possessionPct), shots: num(s.totalShots), onTarget: num(s.shotsOnTarget), corners: num(s.wonCorners), fouls: num(s.foulsCommitted) });
      ev.stats = { home: pick(hs), away: pick(as) };
    }

    const lineups = (d.rosters ?? []).map((r: any) => {
      const roster = (r.roster ?? []) as any[];
      return {
        side: r.homeAway === "away" ? "away" : "home",
        formation: r.formation ?? null,
        starters: roster.filter((p) => p.starter).sort((a, b) => Number(a.formationPlace ?? 99) - Number(b.formationPlace ?? 99)).map(player),
        subs: roster.filter((p) => !p.starter).map(player),
      };
    });

    const commentary = ((d.commentary ?? []) as any[])
      .filter((c) => c.text)
      .slice(-40)
      .reverse()
      .map((c) => ({ minute: c.time?.displayValue ?? "", text: c.text as string }));

    return { event: ev, stats, timeline, lineups, commentary };
  });
}

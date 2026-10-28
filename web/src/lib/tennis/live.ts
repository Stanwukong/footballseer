import "server-only";

import { cached, getJson } from "../live";
import { sameSide } from "../names";
import { getSportyLive, getSportyUpcoming, type SportyEvent } from "../sportybet";
import { getRatings } from "./data";
import { playerKeys, price } from "./model";
import type { RatedPlayer, TennisFeed, TennisMatch, Tour } from "./types";

/*
 * Tennis matches today: SportyBet for what's in play and what's next (with
 * its prices), LiveScore for who is serving and for today's results, since
 * SportyBet drops a match from its live list the moment it ends. Our Elo
 * price is added wherever both players are rated.
 */

const LIVESCORE = "https://prod-public-api.livescore.com/v1/api/app/date/tennis";
const FEED_TTL = 20_000;
const UPCOMING_HOURS = 36;
const SLAMS = /australian open|french open|roland garros|wimbledon|us open/i;

// LiveScore payloads are loosely typed; we read only what we need.
/* eslint-disable @typescript-eslint/no-explicit-any */

/** "Djokovic, Novak" -> "Novak Djokovic". Doubles pairs keep SportyBet's "Smith J / Doe K". */
const displayName = (s: string) => (s.includes("/") || !s.includes(",") ? s : s.split(",").reverse().map((x) => x.trim()).join(" "));

/** "ATP Basel, Switzerland Men Singles" -> "Basel, Switzerland". */
function tournamentName(name: string, category: string) {
  return name
    .replace(new RegExp(`^${category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "")
    .replace(/\s+(men|women|mixed)('s)?\s+(singles|doubles)$/i, "")
    .trim();
}

const tourOf = (category: string, tournament: string): Tour => (/wta|women/i.test(`${category} ${tournament}`) ? "WTA" : "ATP");

function fromSporty(e: SportyEvent): TennisMatch {
  const doubles = e.home.includes("/") || /doubles/i.test(e.tournament);
  const status = e.state === "pre" ? "" : e.period.replace(/^set/i, "Set").replace(/^Not start$/i, "");
  return {
    id: e.id,
    category: e.category,
    tournament: tournamentName(e.tournament, e.category),
    doubles,
    state: e.state,
    status,
    start: e.start,
    players: [displayName(e.home), displayName(e.away)],
    sets: e.score,
    games: e.periods,
    point: e.point,
    serving: null,
    winner: null,
    bestOf: SLAMS.test(e.tournament) && !/women/i.test(e.tournament) && !doubles ? 5 : 3,
    market: e.market && e.market.length === 2 ? [e.market[0], e.market[1]] : null,
    odds: e.odds && e.odds.length === 2 ? [e.odds[0], e.odds[1]] : null,
    model: null,
  };
}

/** UTC YYYYMMDD; LiveScore's last path segment is the UTC offset. */
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

interface LsEvent {
  id: string;
  category: string;
  tournament: string;
  players: [string, string];
  doubles: boolean;
  status: string;
  start: string;
  sets: [number, number];
  games: [number, number][];
  serving: 0 | 1 | null;
  winner: 0 | 1 | null;
}

function lsEvents(data: any): LsEvent[] {
  const out: LsEvent[] = [];
  for (const s of data?.Stages ?? []) {
    for (const e of s.Events ?? []) {
      const t1 = (e.T1 ?? []) as any[], t2 = (e.T2 ?? []) as any[];
      if (!t1.length || !t2.length) continue;
      const games: [number, number][] = [];
      for (let k = 1; k <= 5 && e[`Tr1S${k}`] != null; k++) games.push([Number(e[`Tr1S${k}`]), Number(e[`Tr2S${k}`])]);
      const esd = String(e.Esd ?? "");
      out.push({
        id: `ls:${e.Eid}`,
        category: s.Cnm ?? "",
        tournament: s.Snm ?? "",
        players: [t1.map((p) => p.Nm).join(" / "), t2.map((p) => p.Nm).join(" / ")],
        doubles: t1.length > 1,
        status: String(e.Eps ?? ""),
        start: esd.length >= 12 ? `${esd.slice(0, 4)}-${esd.slice(4, 6)}-${esd.slice(6, 8)}T${esd.slice(8, 10)}:${esd.slice(10, 12)}:00Z` : "",
        sets: [Number(e.Tr1 ?? 0), Number(e.Tr2 ?? 0)],
        games,
        serving: e.Esrv === 1 ? 0 : e.Esrv === 2 ? 1 : null,
        winner: e.Ewt === 1 ? 0 : e.Ewt === 2 ? 1 : null,
      });
    }
  }
  return out;
}

const FINISHED = new Set(["FT", "Ret.", "Aband.", "AW"]);

function finished(e: LsEvent): TennisMatch {
  return {
    id: e.id,
    category: e.category,
    tournament: e.tournament,
    doubles: e.doubles,
    state: "post",
    status: e.status === "FT" ? "Final" : e.status,
    start: e.start,
    players: e.players,
    sets: e.sets,
    games: e.games,
    point: null,
    serving: null,
    winner: e.winner,
    bestOf: Math.max(...e.sets) === 3 ? 5 : 3,
    market: null,
    odds: null,
    model: null,
  };
}

function ratingIndex(players: RatedPlayer[]) {
  const by = new Map<string, RatedPlayer>();
  for (const p of players) for (const k of playerKeys(p.name)) if (!by.has(`${p.tour}|${k}`)) by.set(`${p.tour}|${k}`, p);
  return (name: string, tour: Tour) => {
    for (const k of playerKeys(name)) {
      const p = by.get(`${tour}|${k}`);
      if (p) return p;
    }
    return undefined;
  };
}

/** Today's tennis: in play, still to come (the next 36 hours) and finished, in that order. */
export function getTennisFeed(): Promise<TennisFeed> {
  return cached("tennis-feed", FEED_TTL, async () => {
    const now = new Date();
    const days = [ymd(now), ...(now.getUTCHours() < 6 ? [ymd(new Date(now.getTime() - 86_400_000))] : [])];
    const [live, upcoming, ratings, ...ls] = await Promise.allSettled([
      getSportyLive("tennis"),
      getSportyUpcoming("tennis"),
      getRatings(),
      ...days.map((d) => cached(`ls-tennis:${d}`, FEED_TTL, () => getJson(`${LIVESCORE}/${d}/0?MD=1`))),
    ]);
    if (live.status === "rejected" && upcoming.status === "rejected") throw new Error("SportyBet unreachable");

    const lsAll = ls.flatMap((p) => (p.status === "fulfilled" ? lsEvents(p.value) : []));
    const horizon = now.getTime() + UPCOMING_HOURS * 3_600_000;
    const sporty = [
      ...(live.status === "fulfilled" ? live.value : []),
      ...(upcoming.status === "fulfilled" ? upcoming.value.filter((e) => Date.parse(e.start) < horizon) : []),
    ];
    const seen = new Set<string>();
    const matches: TennisMatch[] = [];
    for (const e of sporty) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const m = fromSporty(e);
      if (m.state === "in") {
        const twin = lsAll.find((x) => x.doubles === m.doubles && sameSide(x.players[0], m.players[0]) && sameSide(x.players[1], m.players[1]));
        if (twin) m.serving = twin.serving;
      }
      matches.push(m);
    }
    for (const e of lsAll) if (FINISHED.has(e.status)) matches.push(finished(e));

    if (ratings.status === "fulfilled" && ratings.value.players.length) {
      const find = ratingIndex(ratings.value.players);
      for (const m of matches) {
        if (m.doubles) continue;
        const tour = tourOf(m.category, m.tournament);
        const a = find(m.players[0], tour), b = find(m.players[1], tour);
        if (!a || !b || a.id === b.id) continue;
        const p = price(a.elo - b.elo, m.bestOf, ratings.value.scale);
        m.model = { p: [p, 1 - p], elo: [a.elo, b.elo], rank: [a.rank, b.rank] };
      }
    }

    const rank = { in: 0, pre: 1, post: 2 } as const;
    matches.sort((a, b) => rank[a.state] - rank[b.state] || (a.state === "post" ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));
    return { updated: now.toISOString(), source: "SportyBet · LiveScore", matches };
  });
}

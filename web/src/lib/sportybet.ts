import "server-only";

import { cached, getJson } from "./live";
import { sameSide } from "./names";
import type { Sport } from "./nav";
import type { ElsewhereEvent } from "./types";

/*
 * SportyBet's public site API (no key): every match it has in play, and its
 * pre-match list, for football, basketball and tennis. Event ids are
 * Sportradar's ("sr:match:N"). Each event carries the bookmaker's win market
 * with its own fair probabilities, which we show as "the market's view".
 *
 * Match stats aren't here: SportyBet's tracker reads them from Sportradar's
 * licensed feed, which needs a token, so stats come from ESPN and LiveScore.
 */

const BASE = "https://www.sportybet.com/api/ng/factsCenter";
const SPORT_ID: Record<Sport, string> = { football: "sr:sport:1", basketball: "sr:sport:2", tennis: "sr:sport:5" };
/** The match-winner market: 1X2 for football, winner incl. overtime for basketball, winner for tennis. */
const WIN_MARKET: Record<Sport, string> = { football: "1", basketball: "219", tennis: "186" };
const LIVE_TTL = 15_000;
const UPCOMING_TTL = 5 * 60_000;

export interface SportyEvent {
  /** "sr:match:N" */
  id: string;
  category: string;
  tournament: string;
  state: "pre" | "in";
  /** SportyBet's period label: "H2", "Q3", "set 2", "Not start". */
  period: string;
  /** Match clock as shown, football and basketball only: "73:46". */
  clock: string | null;
  start: string;
  home: string;
  away: string;
  /** Goals, points, or sets won. */
  score: [number, number] | null;
  /** Per half, quarter or set. */
  periods: [number, number][];
  /** Tennis: points in the current game, "30:15". */
  point: [string, string] | null;
  /** The bookmaker's fair chances: [home, away], or [home, draw, away] for football. */
  market: number[] | null;
  odds: number[] | null;
}

// SportyBet payloads are large and loosely typed; we read only what we need.
/* eslint-disable @typescript-eslint/no-explicit-any */

const pair = (s: unknown): [number, number] | null => {
  const m = /^(\d+):(\d+)$/.exec(String(s ?? ""));
  return m ? [Number(m[1]), Number(m[2])] : null;
};

function parse(e: any, sport: Sport): SportyEvent | null {
  if (!e?.eventId || !e.homeTeamName || !e.awayTeamName) return null;
  const win = (e.markets ?? []).find((m: any) => m.id === WIN_MARKET[sport] && !m.specifier);
  const outs: any[] = win?.outcomes ?? [];
  const probs = outs.map((o) => Number(o.probability));
  const total = probs.reduce((a, b) => a + b, 0);
  return {
    id: e.eventId,
    category: e.sport?.category?.name ?? "",
    tournament: e.sport?.category?.tournament?.name ?? "",
    state: e.status === 0 ? "pre" : "in",
    period: e.matchStatus ?? "",
    clock: sport === "tennis" ? null : (e.playedSeconds ?? null),
    start: new Date(Number(e.estimateStartTime)).toISOString(),
    home: e.homeTeamName,
    away: e.awayTeamName,
    score: e.status === 0 ? null : pair(e.setScore),
    periods: ((e.gameScore ?? []) as string[]).map(pair).filter((p): p is [number, number] => !!p),
    point: sport === "tennis" ? textPoint(e.pointScore) : null,
    market: outs.length >= 2 && total > 0 && probs.every(Number.isFinite) ? probs.map((p) => p / total) : null,
    odds: outs.length >= 2 ? outs.map((o) => Number(o.odds)) : null,
  };
}

/** Tennis points: "30:15", or "A:40" at advantage. */
function textPoint(s: unknown): [string, string] | null {
  const m = /^([0-9A]+):([0-9A]+)$/i.exec(String(s ?? ""));
  return m ? [m[1], m[2]] : null;
}

function flatten(data: any, sport: Sport): SportyEvent[] {
  return ((data?.data ?? []) as any[]).flatMap((t) => ((t.events ?? []) as any[]).map((e) => parse(e, sport))).filter((e): e is SportyEvent => !!e);
}

/** Every match SportyBet has in play right now. */
export function getSportyLive(sport: Sport): Promise<SportyEvent[]> {
  return cached(`sporty-live:${sport}`, LIVE_TTL, async () =>
    flatten(await getJson(`${BASE}/liveOrPrematchEvents?sportId=${encodeURIComponent(SPORT_ID[sport])}`), sport),
  );
}

/** Every match SportyBet lists before the start, across all its tournaments. Two requests: the tournaments, then their events. */
export function getSportyUpcoming(sport: Sport): Promise<SportyEvent[]> {
  return cached(`sporty-upcoming:${sport}`, UPCOMING_TTL, async () => {
    const list = (await getJson(`${BASE}/popularAndSportList?sportId=${encodeURIComponent(SPORT_ID[sport])}&productId=3`)) as any;
    const ids: string[] = ((list?.data?.sportList?.[0]?.categories ?? []) as any[]).flatMap((c) => (c.tournaments ?? []).map((t: any) => t.id));
    if (!ids.length) return [];
    const res = await fetch(`${BASE}/pcEvents`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json", "User-Agent": "footballseer/0.1" },
      body: JSON.stringify([{ sportId: SPORT_ID[sport], marketId: WIN_MARKET[sport], tournamentId: ids.map((id) => [id]) }]),
    });
    if (!res.ok) throw new Error(`${res.status} pcEvents`);
    return flatten(await res.json(), sport).filter((e) => e.state === "pre");
  });
}

// --------------------------------------------------------------------------- //
// Matching SportyBet events to another feed's, by team names and start time
// --------------------------------------------------------------------------- //

/**
 * The SportyBet event for a match from another feed: same start within three
 * hours and both sides matching, or one side matching with the same score.
 */
export function findSporty(events: SportyEvent[], m: { home: string; away: string; kickoff: string; score?: [number, number] }) {
  const at = Date.parse(m.kickoff);
  let best: SportyEvent | undefined;
  for (const e of events) {
    if (Math.abs(Date.parse(e.start) - at) > 3 * 3_600_000) continue;
    const h = sameSide(e.home, m.home), a = sameSide(e.away, m.away);
    if (h && a) return e;
    if ((h || a) && m.score && e.score && e.score[0] === m.score[0] && e.score[1] === m.score[1]) best ??= e;
  }
  return best;
}

interface Mergeable {
  state: string;
  home: string;
  away: string;
  kickoff: string;
  score: [number, number];
  market?: number[] | null;
}

/** "73:46" in the second half -> "74'"; half time and basketball periods as SportyBet labels them. */
function statusOf(e: SportyEvent) {
  if (e.clock && /^H[12]$/.test(e.period)) return `${parseInt(e.clock, 10) + 1}'`;
  return e.period === "Halftime" ? "HT" : e.period;
}

/**
 * Puts SportyBet's in-play market on each of our games in play that it also
 * lists, and returns the games in play it lists that we don't.
 */
export function mergeSporty(events: Mergeable[], sporty: SportyEvent[]): ElsewhereEvent[] {
  const live = sporty.filter((s) => s.state === "in");
  const used = new Set<string>();
  for (const e of events) {
    if (e.state !== "in") continue;
    const s = findSporty(live.filter((x) => !used.has(x.id)), e);
    if (!s) continue;
    used.add(s.id);
    e.market = s.market;
  }
  return live
    .filter((s) => !used.has(s.id))
    .map((s) => ({ id: s.id, competition: [s.category, s.tournament].filter(Boolean).join(" · "), status: statusOf(s), home: s.home, away: s.away, score: s.score, market: s.market }));
}

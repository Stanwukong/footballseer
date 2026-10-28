/*
 * One player's view of matches.json: their results newest first, from their
 * side of the net, with the model's pre-match chance; their rating month by
 * month; and head-to-heads.
 */

import { price } from "./model";
import type { MatchesFile, Surface, WL } from "./types";

export interface PlayedMatch {
  date: string;
  event: string;
  surface: Surface;
  round: string;
  opponent: { id: string; name: string };
  won: boolean;
  /** Games from this player's side: "6-4 3-6 7-6". */
  score: string;
  retired: boolean;
  bestOf: 3 | 5;
  /** Both ratings going in. */
  elo: number;
  oppElo: number;
  /** The model's chance for this player before the match. */
  p: number;
}

/** Every rated match a player played, newest first. */
export function playerMatches(file: MatchesFile, id: string, scale: number): PlayedMatch[] {
  const out: PlayedMatch[] = [];
  for (const [date, ev, rd, p1, p2, winner, sets, bestOf, retired, e1, e2] of file.rows) {
    if (p1 !== id && p2 !== id) continue;
    const first = p1 === id;
    const [event, surface] = file.events[ev];
    const opp = first ? p2 : p1;
    const elo = first ? e1 : e2, oppElo = first ? e2 : e1;
    out.push({
      date,
      event,
      surface,
      round: file.rounds[rd],
      opponent: { id: opp, name: file.names[opp] ?? "Unknown" },
      won: winner === (first ? 1 : 2),
      score: first ? sets : sets.split(" ").map((s) => s.split("-").reverse().join("-")).join(" "),
      retired: retired === 1,
      bestOf,
      elo,
      oppElo,
      p: price(elo - oppElo, bestOf, scale),
    });
  }
  return out.reverse();
}

/** The rating at the end of each month a player played, oldest first, ending on today's rating. */
export function eloHistory(matches: PlayedMatch[], current: number): { month: string; elo: number }[] {
  const byMonth = new Map<string, number>();
  // A match's pre-match rating is the rating after the one before it.
  const oldest = [...matches].reverse();
  for (let k = 0; k < oldest.length; k++) {
    const after = k + 1 < oldest.length ? oldest[k + 1].elo : current;
    byMonth.set(oldest[k].date.slice(0, 7), after);
  }
  return [...byMonth].map(([month, elo]) => ({ month, elo }));
}

/** Opponents met at least twice, most meetings first. */
export function rivals(matches: PlayedMatch[], min = 2) {
  const by = new Map<string, { id: string; name: string; record: WL; last: string }>();
  for (const m of matches) {
    const r = by.get(m.opponent.id) ?? { ...m.opponent, record: [0, 0] as WL, last: m.date };
    r.record[m.won ? 0 : 1]++;
    by.set(m.opponent.id, r);
  }
  return [...by.values()].filter((r) => r.record[0] + r.record[1] >= min).sort((a, b) => b.record[0] + b.record[1] - (a.record[0] + a.record[1]) || b.last.localeCompare(a.last));
}

/** Matches between two players, newest first, from a's side. */
export const headToHead = (file: MatchesFile, a: string, b: string, scale: number) => playerMatches(file, a, scale).filter((m) => m.opponent.id === b);

export const wlRate = ([w, l]: WL) => (w + l ? w / (w + l) : null);

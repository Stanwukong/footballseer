import "server-only";

import { cached, getJson } from "./live";
import { sameSide } from "./names";
import type { LiveTeamStats } from "./types";

/*
 * LiveScore's public app API (no key), the fallback for football match stats
 * when ESPN's summary has none: possession, shots, corners, cards and xG for
 * the bigger leagues. It's looked up by team names and kick-off, since its
 * event ids are its own.
 */

const BASE = "https://prod-public-api.livescore.com/v1/api/app";
const DAY_TTL = 60_000;
const STATS_TTL = 30_000;

// LiveScore payloads are loosely typed; we read only what we need.
/* eslint-disable @typescript-eslint/no-explicit-any */

/** LiveScore stat key -> our label, in display order (labels match lib/live.ts). */
const LABELS: [string, string][] = [
  ["Pss", "Possession %"], ["Xg", "Expected goals"], ["Shots", "Shots"], ["Shon", "Shots on target"], ["Shbl", "Blocked shots"],
  ["Cos", "Corners"], ["Ofs", "Offsides"], ["Fls", "Fouls"], ["Ycs", "Yellow cards"], ["Rcs", "Red cards"], ["Crs", "Crosses"],
  ["Ths", "Throw-ins"], ["Gks", "Goal kicks"],
];

const ymd = (iso: string) => iso.slice(0, 10).replace(/-/g, "");

async function findEvent(m: { home: string; away: string; kickoff: string }): Promise<string | null> {
  const day = (await cached(`ls-soccer:${ymd(m.kickoff)}`, DAY_TTL, () => getJson(`${BASE}/date/soccer/${ymd(m.kickoff)}/0?MD=1`))) as any;
  for (const s of day?.Stages ?? []) {
    for (const e of s.Events ?? []) {
      if (sameSide(e.T1?.[0]?.Nm ?? "", m.home) && sameSide(e.T2?.[0]?.Nm ?? "", m.away)) return String(e.Eid);
    }
  }
  return null;
}

/** The stats box for a match, [label, home, away], and the headline numbers; empty when LiveScore has none. */
export async function liveScoreStats(m: { home: string; away: string; kickoff: string }): Promise<{ box: [string, string, string][]; team: { home: LiveTeamStats; away: LiveTeamStats } | null }> {
  const id = await findEvent(m);
  if (!id) return { box: [], team: null };
  const d = (await cached(`ls-stats:${id}`, STATS_TTL, () => getJson(`${BASE}/statistics/soccer/${id}?locale=en`))) as any;
  const [h, a] = [d?.Stat?.find((x: any) => x.Tnb === 1), d?.Stat?.find((x: any) => x.Tnb === 2)];
  if (!h || !a) return { box: [], team: null };
  for (const t of [h, a]) t.Shots = (t.Shon ?? 0) + (t.Shof ?? 0) + (t.Shbl ?? 0);
  const box = LABELS.filter(([k]) => h[k] != null && a[k] != null).map(([k, label]) => [label, String(h[k]), String(a[k])] as [string, string, string]);
  const team = (t: any): LiveTeamStats => ({ possession: t.Pss, shots: t.Shots, onTarget: t.Shon, corners: t.Cos, fouls: t.Fls });
  return { box, team: { home: team(h), away: team(a) } };
}

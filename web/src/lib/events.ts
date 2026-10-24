import type { H2H, Rate } from "./types";

/**
 * A statistical event, read three ways: the model market that prices it, the
 * team counter it maps to for each side, and how to test it on a past score.
 */
export interface EventSpec {
  key: string;
  label: string;
  market: string;
  /** Team counter for the home and away side; `!` means the complement (n − count). */
  home: string;
  away: string;
  ht?: boolean;
  test: (hg: number, ag: number) => boolean;
}

const goals = (line: number): EventSpec[] => [
  { key: `O${line}`, label: `Over ${line} goals`, market: `O${line}`, home: `O${line}`, away: `O${line}`, test: (h, a) => h + a > line },
  { key: `U${line}`, label: `Under ${line} goals`, market: `U${line}`, home: `!O${line}`, away: `!O${line}`, test: (h, a) => h + a < line },
];

export const EVENTS: EventSpec[] = [
  ...goals(1.5),
  ...goals(2.5),
  ...goals(3.5),
  { key: "BTTS_Y", label: "Both teams score", market: "BTTS_Y", home: "BTTS_Y", away: "BTTS_Y", test: (h, a) => h > 0 && a > 0 },
  { key: "BTTS_N", label: "Not both teams score", market: "BTTS_N", home: "!BTTS_Y", away: "!BTTS_Y", test: (h, a) => !(h > 0 && a > 0) },
  { key: "1", label: "Home win", market: "1", home: "W", away: "L", test: (h, a) => h > a },
  { key: "X", label: "Draw", market: "X", home: "D", away: "D", test: (h, a) => h === a },
  { key: "2", label: "Away win", market: "2", home: "L", away: "W", test: (h, a) => h < a },
  { key: "HT_O0.5", label: "Goal in 1st half", market: "HT_O0.5", home: "HT_O0.5", away: "HT_O0.5", ht: true, test: () => false },
  { key: "HT_O1.5", label: "2+ goals in 1st half", market: "HT_O1.5", home: "HT_O1.5", away: "HT_O1.5", ht: true, test: () => false },
];

export const EVENT_BY_KEY = Object.fromEntries(EVENTS.map((e) => [e.key, e]));

/** Share of a team's matches with the event, or null with no sample. */
export function teamRate(r: Rate | undefined, counter: string, ht = false): { hits: number; n: number; rate: number } | null {
  const n = ht ? r?.nht : r?.n;
  if (!r?.c || !n) return null;
  const neg = counter.startsWith("!");
  const c = r.c[neg ? counter.slice(1) : counter];
  if (c == null) return null;
  const hits = neg ? n - c : c;
  return { hits, n, rate: hits / n };
}

/** Share of recent meetings with the event, seen from the current home side. */
export function h2hRate(h2h: H2H[], home: string, e: EventSpec): { hits: number; n: number; rate: number } | null {
  if (!h2h.length || e.ht) return null;
  let hits = 0;
  for (const [, h, , hg, ag] of h2h) {
    const [us, them] = h === home ? [hg, ag] : [ag, hg];
    if (e.test(us, them)) hits++;
  }
  return { hits, n: h2h.length, rate: hits / h2h.length };
}

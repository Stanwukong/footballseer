import type { Probs, Trend } from "./types";

export const LABELS: Record<string, string> = {
  "1": "Home win",
  X: "Draw",
  "2": "Away win",
  "1X": "Home or draw",
  "12": "No draw",
  X2: "Away or draw",
  DNB1: "Home draw-no-bet",
  DNB2: "Away draw-no-bet",
  BTTS_Y: "Both teams score",
  BTTS_N: "Not both teams score",
  "O0.5": "Over 0.5 goals",
  "O1.5": "Over 1.5 goals",
  "O2.5": "Over 2.5 goals",
  "O3.5": "Over 3.5 goals",
  "O4.5": "Over 4.5 goals",
  "U0.5": "Under 0.5 goals",
  "U1.5": "Under 1.5 goals",
  "U2.5": "Under 2.5 goals",
  "U3.5": "Under 3.5 goals",
  "U4.5": "Under 4.5 goals",
  "H_O0.5": "Home scores",
  "H_O1.5": "Home over 1.5",
  "A_O0.5": "Away scores",
  "A_O1.5": "Away over 1.5",
  H_CS: "Home clean sheet",
  A_CS: "Away clean sheet",
  HT_1: "Home leads at half-time",
  HT_X: "Level at half-time",
  HT_2: "Away leads at half-time",
  "HT_O0.5": "Over 0.5 goals 1st half",
  "HT_U0.5": "Under 0.5 goals 1st half",
  "HT_O1.5": "Over 1.5 goals 1st half",
  "HT_U1.5": "Under 1.5 goals 1st half",
  HT_BTTS_Y: "Both score 1st half",
  HT_BTTS_N: "Not both score 1st half",
  "2H_O0.5": "Over 0.5 goals 2nd half",
  "2H_U0.5": "Under 0.5 goals 2nd half",
  "2H_O1.5": "Over 1.5 goals 2nd half",
  "2H_U1.5": "Under 1.5 goals 2nd half",
  "2H_BTTS_Y": "Both score 2nd half",
  "2H_BTTS_N": "Not both score 2nd half",
  "C_O7.5": "Over 7.5 corners",
  "C_U7.5": "Under 7.5 corners",
  "C_O8.5": "Over 8.5 corners",
  "C_U8.5": "Under 8.5 corners",
  "C_O9.5": "Over 9.5 corners",
  "C_U9.5": "Under 9.5 corners",
  "C_O10.5": "Over 10.5 corners",
  "C_U10.5": "Under 10.5 corners",
};

export const MARKET_GROUPS: { title: string; keys: string[] }[] = [
  { title: "Result", keys: ["1", "X", "2"] },
  { title: "Double chance", keys: ["1X", "12", "X2", "DNB1", "DNB2"] },
  { title: "Goals", keys: ["O0.5", "O1.5", "O2.5", "O3.5", "O4.5", "U1.5", "U2.5", "U3.5"] },
  { title: "Both teams to score", keys: ["BTTS_Y", "BTTS_N"] },
  { title: "Team goals", keys: ["H_O0.5", "H_O1.5", "A_O0.5", "A_O1.5", "H_CS", "A_CS"] },
  { title: "First half", keys: ["HT_1", "HT_X", "HT_2", "HT_O0.5", "HT_O1.5", "HT_BTTS_Y"] },
  { title: "Second half", keys: ["2H_O0.5", "2H_O1.5", "2H_BTTS_Y"] },
  { title: "Corners", keys: ["C_O7.5", "C_O8.5", "C_O9.5", "C_O10.5", "C_U9.5", "C_U10.5"] },
];

/** Probability of a market, deriving the complement for unders/"no" that aren't stored. */
export function prob(p: Probs, key: string): number | undefined {
  if (p[key] != null) return p[key];
  const complement = key.replace(/_U(\d)/, "_O$1").replace(/BTTS_N$/, "BTTS_Y");
  if (complement !== key && p[complement] != null) return 1 - p[complement];
  return undefined;
}

/**
 * The market tabs on the matches page, as on BetMines: each tab shows the
 * most likely outcome of its market for every match.
 */
export interface MarketTab {
  id: string;
  label: string;
  /** Short market name for the row. */
  market: string;
  outcomes: { key: string; pick: string }[];
}

const TOP_TIP_KEYS = ["1", "2", "1X", "X2", "O1.5", "O2.5", "U2.5", "U3.5", "BTTS_Y", "BTTS_N"];

export const MARKET_TABS: MarketTab[] = [
  { id: "top", label: "Top tips", market: "", outcomes: [] },
  { id: "1x2", label: "1X2", market: "1X2", outcomes: [{ key: "1", pick: "1" }, { key: "X", pick: "X" }, { key: "2", pick: "2" }] },
  { id: "btts", label: "Both teams to score", market: "BTTS", outcomes: [{ key: "BTTS_Y", pick: "Yes" }, { key: "BTTS_N", pick: "No" }] },
  { id: "ou25", label: "Under/Over 2.5", market: "Goals", outcomes: [{ key: "O2.5", pick: "+2.5" }, { key: "U2.5", pick: "−2.5" }] },
  { id: "dc", label: "Double chance", market: "Double chance", outcomes: [{ key: "1X", pick: "1X" }, { key: "X2", pick: "X2" }, { key: "12", pick: "12" }] },
  { id: "ou15", label: "Under/Over 1.5", market: "Goals", outcomes: [{ key: "O1.5", pick: "+1.5" }, { key: "U1.5", pick: "−1.5" }] },
  { id: "ou35", label: "Under/Over 3.5", market: "Goals", outcomes: [{ key: "O3.5", pick: "+3.5" }, { key: "U3.5", pick: "−3.5" }] },
  { id: "ht05", label: "1st half 0.5", market: "Goals 1st half", outcomes: [{ key: "HT_O0.5", pick: "+0.5" }, { key: "HT_U0.5", pick: "−0.5" }] },
  { id: "ht15", label: "1st half 1.5", market: "Goals 1st half", outcomes: [{ key: "HT_O1.5", pick: "+1.5" }, { key: "HT_U1.5", pick: "−1.5" }] },
  { id: "2h05", label: "2nd half 0.5", market: "Goals 2nd half", outcomes: [{ key: "2H_O0.5", pick: "+0.5" }, { key: "2H_U0.5", pick: "−0.5" }] },
  { id: "2h15", label: "2nd half 1.5", market: "Goals 2nd half", outcomes: [{ key: "2H_O1.5", pick: "+1.5" }, { key: "2H_U1.5", pick: "−1.5" }] },
  { id: "htbtts", label: "BTTS 1st half", market: "BTTS 1st half", outcomes: [{ key: "HT_BTTS_Y", pick: "Yes" }, { key: "HT_BTTS_N", pick: "No" }] },
  { id: "2hbtts", label: "BTTS 2nd half", market: "BTTS 2nd half", outcomes: [{ key: "2H_BTTS_Y", pick: "Yes" }, { key: "2H_BTTS_N", pick: "No" }] },
  ...[7.5, 8.5, 9.5, 10.5].map((l) => ({
    id: `c${l}`.replace(".", ""),
    label: `Corners ${l}`,
    market: "Corners",
    outcomes: [{ key: `C_O${l}`, pick: `+${l}` }, { key: `C_U${l}`, pick: `−${l}` }],
  })),
];

const PICK_TEXT: Record<string, [string, string]> = {
  "1": ["1X2", "1"], X: ["1X2", "X"], "2": ["1X2", "2"],
  "1X": ["Double chance", "1X"], X2: ["Double chance", "X2"], "12": ["Double chance", "12"],
  BTTS_Y: ["BTTS", "Yes"], BTTS_N: ["BTTS", "No"],
};

/** [market, pick] as shown in a row, e.g. ["Goals", "+2.5"]. */
export function pickText(key: string): [string, string] {
  if (PICK_TEXT[key]) return PICK_TEXT[key];
  for (const t of MARKET_TABS) {
    const o = t.outcomes.find((x) => x.key === key);
    if (o) return [t.market, o.pick];
  }
  return [LABELS[key] ?? key, ""];
}

export interface Pick {
  key: string;
  p: number;
}

/** The pick a tab shows for a match, or null when the market isn't priced (e.g. corners). */
export function tabPick(tab: MarketTab, p: Probs): Pick | null {
  if (tab.id === "top") return topTip(p);
  let best: Pick | null = null;
  for (const o of tab.outcomes) {
    const v = prob(p, o.key);
    if (v != null && (!best || v > best.p)) best = { key: o.key, p: v };
  }
  return best;
}

/** The likeliest of the main markets that still pays something (fair odds of 1.18 or more). */
export function topTip(p: Probs): Pick {
  const cands = TOP_TIP_KEYS.map((key) => ({ key, p: p[key] })).filter((c) => c.p != null);
  const playable = cands.filter((c) => c.p <= 0.85);
  return (playable.length ? playable : cands).reduce((a, b) => (b.p > a.p ? b : a));
}

/** Bookmaker odds key for a market, where the pipeline has them. */
export const ODDS_KEY: Record<string, string> = { "1": "1", X: "X", "2": "2", "O2.5": "O2.5", "U2.5": "U2.5" };

/** A probability as a percentage. Near-certain values that aren't certain say so rather than rounding to 0% or 100%. */
export const pct = (p: number | null | undefined, digits = 0) => {
  if (p == null) return "–";
  const edge = 0.5 * 10 ** -(digits + 2);
  if (p > 0 && p < edge) return `<${(edge * 200).toFixed(digits)}%`;
  if (p < 1 && p > 1 - edge) return `>${(100 - edge * 200).toFixed(digits)}%`;
  return `${(p * 100).toFixed(digits)}%`;
};

export const fairOdds = (p: number) => (p > 0 ? (1 / p).toFixed(2) : "–");

export const signedPct = (x: number | null | undefined, digits = 1) =>
  x == null ? "–" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;

/** 0..5 strength bucket for the probability heat scale. */
export function heat(p: number | null | undefined) {
  if (p == null) return 0;
  if (p >= 0.85) return 5;
  if (p >= 0.75) return 4;
  if (p >= 0.65) return 3;
  if (p >= 0.55) return 2;
  if (p >= 0.45) return 1;
  return 0;
}

export type OddsFormat = "decimal" | "fractional" | "american";

const FRACTIONS = [[1, 10], [1, 8], [1, 6], [1, 5], [2, 9], [1, 4], [2, 7], [3, 10], [1, 3], [4, 11], [2, 5], [4, 9], [1, 2],
  [8, 15], [4, 7], [8, 13], [4, 6], [8, 11], [4, 5], [5, 6], [10, 11], [1, 1], [11, 10], [6, 5], [5, 4], [11, 8], [6, 4],
  [13, 8], [7, 4], [15, 8], [2, 1], [9, 4], [5, 2], [11, 4], [3, 1], [10, 3], [7, 2], [4, 1], [9, 2], [5, 1], [11, 2],
  [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [12, 1], [14, 1], [16, 1], [20, 1], [25, 1], [33, 1], [50, 1], [100, 1]];

export function formatOdds(d: number | null | undefined, f: OddsFormat = "decimal"): string {
  if (d == null || !Number.isFinite(d) || d <= 1) return "–";
  if (f === "fractional") {
    const [n, m] = FRACTIONS.reduce((a, b) => (Math.abs(b[0] / b[1] + 1 - d) < Math.abs(a[0] / a[1] + 1 - d) ? b : a));
    return `${n}/${m}`;
  }
  if (f === "american") return d >= 2 ? `+${Math.round((d - 1) * 100)}` : `${Math.round(-100 / (d - 1))}`;
  return d.toFixed(2);
}

export function formatDay(iso: string, today?: string) {
  if (today) {
    const diff = Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
  }
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "2627" (football-data season code) -> "2026/27"; other labels pass through. */
export function season(code: string | undefined) {
  if (!code) return "";
  return /^\d{4}$/.test(code) && Number(code.slice(2)) === (Number(code.slice(0, 2)) + 1) % 100 ? `20${code.slice(0, 2)}/${code.slice(2)}` : code;
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function shortDate(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function addDays(iso: string, n: number) {
  return new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Market name with team names substituted, e.g. "Arsenal win". */
export function marketName(key: string, home?: string, away?: string) {
  if (home && away) {
    if (key === "1") return `${home} win`;
    if (key === "2") return `${away} win`;
    if (key === "H_O0.5") return `${home} to score`;
    if (key === "A_O0.5") return `${away} to score`;
    if (key === "H_CS") return `${home} clean sheet`;
    if (key === "A_CS") return `${away} clean sheet`;
  }
  return LABELS[key] ?? key;
}

/** Plain-English text for a streak, e.g. "Won the last 9 home matches". */
const TREND_TEXT: Record<string, string> = {
  W: "Won", UNB: "Unbeaten in", L: "Lost", WL: "Without a win in", D: "Drew", ND: "No draw in",
  "O1.5": "Over 1.5 goals in", "U1.5": "Under 1.5 goals in", "O2.5": "Over 2.5 goals in", "U2.5": "Under 2.5 goals in",
  "O3.5": "Over 3.5 goals in", "U3.5": "Under 3.5 goals in", BTTS_Y: "Both teams scored in",
  BTTS_N: "A side failed to score in", CS: "Clean sheet in", FTS: "Failed to score in", SC: "Scored in",
  CON: "Conceded in", "HT_O0.5": "A first-half goal in",
};

export const TREND_EVENTS: { key: string; label: string }[] = [
  { key: "W", label: "Wins" }, { key: "UNB", label: "Unbeaten" }, { key: "L", label: "Defeats" },
  { key: "WL", label: "Winless" }, { key: "D", label: "Draws" }, { key: "ND", label: "No draws" },
  { key: "O1.5", label: "+1.5 goals" }, { key: "U1.5", label: "−1.5 goals" }, { key: "O2.5", label: "+2.5 goals" },
  { key: "U2.5", label: "−2.5 goals" }, { key: "O3.5", label: "+3.5 goals" }, { key: "U3.5", label: "−3.5 goals" },
  { key: "BTTS_Y", label: "BTTS yes" }, { key: "BTTS_N", label: "BTTS no" }, { key: "CS", label: "Clean sheets" },
  { key: "FTS", label: "Failed to score" }, { key: "SC", label: "Scored" }, { key: "CON", label: "Conceded" },
  { key: "HT_O0.5", label: "1st-half goal" },
];

export function trendText(t: Trend) {
  const scope = t.s === "home" ? "home " : t.s === "away" ? "away " : "";
  return `${TREND_TEXT[t.e] ?? t.e} the last ${t.n} ${scope}matches`;
}

/** Three-letter country codes for league tags. */
export const COUNTRY_CODE: Record<string, string> = {
  England: "ENG", Scotland: "SCO", Germany: "GER", Italy: "ITA", Spain: "ESP", France: "FRA",
  Netherlands: "NED", Belgium: "BEL", Portugal: "POR", Turkey: "TUR", Greece: "GRE", Argentina: "ARG",
  Austria: "AUT", Brazil: "BRA", China: "CHN", Denmark: "DEN", Finland: "FIN", Ireland: "IRL", Japan: "JPN",
  Mexico: "MEX", Norway: "NOR", Poland: "POL", Romania: "ROU", Russia: "RUS", Sweden: "SWE",
  Switzerland: "SUI", USA: "USA",
};

export const countryCode = (country: string) => COUNTRY_CODE[country] ?? country.slice(0, 3).toUpperCase();

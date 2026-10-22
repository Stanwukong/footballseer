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
};

export const MARKET_GROUPS: { title: string; keys: string[] }[] = [
  { title: "Result", keys: ["1", "X", "2"] },
  { title: "Double chance", keys: ["1X", "12", "X2", "DNB1", "DNB2"] },
  { title: "Goals", keys: ["O0.5", "O1.5", "O2.5", "O3.5", "O4.5", "U1.5", "U2.5", "U3.5"] },
  { title: "Both teams to score", keys: ["BTTS_Y", "BTTS_N"] },
  { title: "Team goals", keys: ["H_O0.5", "H_O1.5", "A_O0.5", "A_O1.5", "H_CS", "A_CS"] },
];

export const pct = (p: number | null | undefined, digits = 0) =>
  p == null ? "–" : `${(p * 100).toFixed(digits)}%`;

export const fairOdds = (p: number) => (p > 0 ? (1 / p).toFixed(2) : "–");

export const signedPct = (x: number | null | undefined, digits = 1) =>
  x == null ? "–" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;

export function formatDay(iso: string, today?: string) {
  if (today) {
    const diff = Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
  }
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Market name with team names substituted, e.g. "Arsenal win". */
export function marketName(key: string, home?: string, away?: string) {
  if (home && away) {
    if (key === "1") return `${home} win`;
    if (key === "2") return `${away} win`;
    if (key === "H_O0.5") return `${home} to score`;
    if (key === "A_O0.5") return `${away} to score`;
  }
  return LABELS[key] ?? key;
}

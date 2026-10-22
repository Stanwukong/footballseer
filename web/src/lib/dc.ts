// Browser port of pipeline/footballseer/model.py + markets.py, so the matchup
// predictor can price any pairing without a server round-trip.

import type { League } from "./types";

const MAX_GOALS = 10;

function poissonPmf(k: number, lambda: number) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

export function rates(league: League, home: string, away: string): [number, number] {
  const h = league.teams.find((t) => t.team === home)!;
  const a = league.teams.find((t) => t.team === away)!;
  return [
    Math.exp(league.mu + league.home_adv + h.attack + a.defence),
    Math.exp(league.mu + a.attack + h.defence),
  ];
}

export function scoreMatrix(lh: number, la: number, rho: number): number[][] {
  const ph = Array.from({ length: MAX_GOALS + 1 }, (_, i) => poissonPmf(i, lh));
  const pa = Array.from({ length: MAX_GOALS + 1 }, (_, j) => poissonPmf(j, la));
  const m = ph.map((x) => pa.map((y) => x * y));
  m[0][0] *= 1 - lh * la * rho;
  m[0][1] *= 1 + lh * rho;
  m[1][0] *= 1 + la * rho;
  m[1][1] *= 1 - rho;
  let total = 0;
  for (const row of m) for (let j = 0; j < row.length; j++) total += (row[j] = Math.max(row[j], 0));
  return m.map((row) => row.map((v) => v / total));
}

export function markets(m: number[][]): Record<string, number> {
  const out: Record<string, number> = {};
  let home = 0, draw = 0, away = 0, btts = 0;
  const totals = new Array(2 * MAX_GOALS + 1).fill(0);
  let hScores = 0, h2 = 0, aScores = 0, a2 = 0, hCS = 0, aCS = 0;
  m.forEach((row, i) =>
    row.forEach((p, j) => {
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
      if (i > 0 && j > 0) btts += p;
      if (i > 0) hScores += p;
      if (i > 1) h2 += p;
      if (j > 0) aScores += p;
      if (j > 1) a2 += p;
      if (j === 0) hCS += p;
      if (i === 0) aCS += p;
      totals[i + j] += p;
    }),
  );
  Object.assign(out, {
    "1": home, X: draw, "2": away,
    "1X": home + draw, "12": home + away, X2: draw + away,
    DNB1: home / (home + away), DNB2: away / (home + away),
    BTTS_Y: btts, BTTS_N: 1 - btts,
    "H_O0.5": hScores, "H_O1.5": h2, "A_O0.5": aScores, "A_O1.5": a2,
    H_CS: hCS, A_CS: aCS,
  });
  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) {
    const over = totals.reduce((s, p, t) => (t > line ? s + p : s), 0);
    out[`O${line}`] = over;
    out[`U${line}`] = 1 - over;
  }
  return out;
}

export function topScores(m: number[][], k = 8) {
  const all: { score: string; p: number }[] = [];
  m.forEach((row, i) => row.forEach((p, j) => all.push({ score: `${i}-${j}`, p })));
  return all.sort((a, b) => b.p - a.p).slice(0, k);
}

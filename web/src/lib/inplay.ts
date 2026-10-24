import type { Probs } from "./types";

/*
 * In-play probabilities. The pre-match expected goals are scaled to the time
 * left, adjusted for red cards, and the remaining goals for each side are
 * Poisson; the final score is the current score plus what's left. Simple, but
 * it moves the right way: a 1-0 lead at 80' is worth far more than at 10'.
 */

const RED_OWN = 0.7; // a side down to ten scores less...
const RED_OPP = 1.2; // ...and concedes more
const STOPPAGE = 3; // minutes of added time we expect at the end

function pmf(lambda: number, max: number) {
  const out = [Math.exp(-lambda)];
  for (let k = 1; k <= max; k++) out.push((out[k - 1] * lambda) / k);
  return out;
}

export interface InPlay {
  p: Probs;
  /** Chance each side scores the next goal (0 when no goal is expected). */
  nextGoal: [number, number];
  /** Expected goals still to come. */
  remaining: [number, number];
}

export function inPlay(xg: [number, number], score: [number, number], minute: number, red: [number, number] = [0, 0]): InPlay {
  const left = Math.max(0, 90 + STOPPAGE - Math.max(0, minute)) / 90;
  const lh = xg[0] * left * RED_OWN ** red[0] * RED_OPP ** red[1];
  const la = xg[1] * left * RED_OWN ** red[1] * RED_OPP ** red[0];
  const M = 10;
  const ph = pmf(lh, M), pa = pmf(la, M);
  const [h0, a0] = score;
  let home = 0, draw = 0, away = 0, btts = 0;
  const totals = new Map<number, number>();
  for (let i = 0; i <= M; i++) {
    for (let j = 0; j <= M; j++) {
      const p = ph[i] * pa[j];
      const h = h0 + i, a = a0 + j;
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
      if (h > 0 && a > 0) btts += p;
      totals.set(h + a, (totals.get(h + a) ?? 0) + p);
    }
  }
  const norm = home + draw + away;
  const p: Probs = {
    "1": home / norm, X: draw / norm, "2": away / norm,
    "1X": (home + draw) / norm, X2: (draw + away) / norm, "12": (home + away) / norm,
    BTTS_Y: btts / norm, BTTS_N: 1 - btts / norm,
    "H_O0.5": h0 > 0 ? 1 : 1 - ph[0], "A_O0.5": a0 > 0 ? 1 : 1 - pa[0],
    H_CS: a0 > 0 ? 0 : pa[0], A_CS: h0 > 0 ? 0 : ph[0],
  };
  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) {
    let over = 0;
    for (const [t, v] of totals) if (t > line) over += v;
    p[`O${line}`] = over / norm;
    p[`U${line}`] = 1 - over / norm;
  }
  const anyGoal = 1 - Math.exp(-(lh + la));
  const nextGoal: [number, number] = lh + la > 0 ? [(anyGoal * lh) / (lh + la), (anyGoal * la) / (lh + la)] : [0, 0];
  return { p, nextGoal, remaining: [lh, la] };
}

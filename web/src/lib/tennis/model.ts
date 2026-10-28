/*
 * Pricing from Elo, as in pipeline/footballseer/tennis/model.py: the gap,
 * shrunk by the fitted scale, gives a best-of-three chance; best-of-five
 * plays the matching per-set chance over five sets.
 */

export { playerKeys } from "../names";

const bo3 = (s: number) => s * s * (3 - 2 * s);
const bo5 = (s: number) => s ** 3 * (10 - 15 * s + 6 * s * s);

/** The per-set chance that wins a best-of-three match with chance p. */
export function setChance(p: number) {
  if (p <= 0 || p >= 1) return p;
  let lo = 0, hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (bo3(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function bestOfFive(p: number) {
  if (p <= 0 || p >= 1) return p;
  return bo5(setChance(p));
}

/** Chance for the player `gap` Elo points ahead. */
export function price(gap: number, bestOf: 3 | 5 = 3, scale = 1) {
  const p = 1 / (1 + 10 ** ((-gap * scale) / 400));
  return bestOf === 5 ? bestOfFive(p) : p;
}

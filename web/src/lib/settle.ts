/** Did a full-time market win for score hg-ag? null for a void (draw-no-bet draw) or a market that needs more than the final score. */
export function settle(key: string, hg: number, ag: number): boolean | null {
  const t = hg + ag;
  const over = /^O(\d\.5)$/.exec(key);
  if (over) return t > Number(over[1]);
  const under = /^U(\d\.5)$/.exec(key);
  if (under) return t < Number(under[1]);
  switch (key) {
    case "1": return hg > ag;
    case "X": return hg === ag;
    case "2": return hg < ag;
    case "1X": return hg >= ag;
    case "12": return hg !== ag;
    case "X2": return hg <= ag;
    case "DNB1": return hg === ag ? null : hg > ag;
    case "DNB2": return hg === ag ? null : ag > hg;
    case "BTTS_Y": return hg > 0 && ag > 0;
    case "BTTS_N": return !(hg > 0 && ag > 0);
    case "H_O0.5": return hg > 0;
    case "H_O1.5": return hg > 1;
    case "A_O0.5": return ag > 0;
    case "A_O1.5": return ag > 1;
    case "H_CS": return ag === 0;
    case "A_CS": return hg === 0;
  }
  return null;
}

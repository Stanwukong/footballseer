import { formatDay, LABELS, ordinal, pct, topTip, trendText } from "./format";
import type { Fixture, H2H, StandingRow, TeamStats } from "./types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function record(name: string, form: string) {
  const w = [...form].filter((c) => c === "W").length;
  const d = [...form].filter((c) => c === "D").length;
  const l = form.length - w - d;
  return `${name} won ${w}, drew ${d} and lost ${l} of their last ${form.length} league matches`;
}

export function h2hSummary(h2h: H2H[], home: string) {
  let hw = 0, aw = 0, d = 0, goals = 0;
  for (const [, h, , hg, ag] of h2h) {
    goals += hg + ag;
    if (hg === ag) d++;
    else if ((hg > ag) === (h === home)) hw++;
    else aw++;
  }
  return { hw, aw, d, avg: h2h.length ? goals / h2h.length : 0 };
}

/** A short written preview, built only from the model and the record. */
export function previewParagraphs(
  f: Fixture,
  hs: TeamStats | undefined,
  as: TeamStats | undefined,
  table: StandingRow[],
): string[] {
  const out: string[] = [];
  const pos = (t: string) => table.findIndex((r) => r.team === t) + 1;
  const ph = pos(f.home), pa = pos(f.away);
  const when = `${formatDay(f.date)}${f.time ? ` at ${f.time}` : ""}`;
  out.push(
    `${f.home} host ${f.away} on ${when}.` +
      (ph && pa ? ` ${f.home} are ${ordinal(ph)} in the table and ${f.away} are ${ordinal(pa)}.` : ""),
  );
  out.push(
    `The model gives ${f.home} a ${pct(f.p["1"])} chance of winning, the draw ${pct(f.p.X)} and ${f.away} ${pct(f.p["2"])}. ` +
      `It expects ${f.xg[0].toFixed(1)} goals from ${f.home} and ${f.xg[1].toFixed(1)} from ${f.away}, ` +
      `with a ${pct(f.p["O2.5"])} chance of three or more goals and ${pct(f.p.BTTS_Y)} that both teams score.`,
  );
  if (hs?.form && as?.form) out.push(`${record(f.home, hs.form)}; ${record(f.away, as.form).replace(/ league matches$/, "")}.`);
  if (hs && as) {
    const h10 = hs.rates.l10, a10 = as.rates.l10;
    if (h10.n && a10.n && h10.c && a10.c) {
      out.push(
        `Over 2.5 goals landed in ${h10.c["O2.5"]} of ${f.home}'s last ${h10.n} matches and ${a10.c["O2.5"]} of ${f.away}'s last ${a10.n}; ` +
          `both teams scored in ${h10.c.BTTS_Y} and ${a10.c.BTTS_Y} respectively.`,
      );
    }
    const home = hs.rates.home, away = as.rates.away;
    if (home.n >= 2 && away.n >= 2 && home.c && away.c) {
      out.push(
        `At home this season ${f.home} have ${plural(home.c.W, "win")} from ${home.n}, scoring ${((home.gf ?? 0) / home.n).toFixed(1)} a game; ` +
          `away from home ${f.away} have ${plural(away.c.W, "win")} from ${away.n}, conceding ${((away.ga ?? 0) / away.n).toFixed(1)} a game.`,
      );
    }
  }
  if (f.h2h.length) {
    const s = h2hSummary(f.h2h, f.home);
    const [d, h, a, hg, ag] = f.h2h[0];
    out.push(
      `In their last ${plural(f.h2h.length, "league meeting")}, ${f.home} won ${s.hw}, ${f.away} won ${s.aw} and ${plural(s.d, "game")} ended level, ` +
        `averaging ${s.avg.toFixed(1)} goals. The most recent, on ${formatDay(d)}, finished ${h} ${hg}-${ag} ${a}.`,
    );
  }
  const streak = [...(hs?.trends ?? []).map((t) => ({ t, team: f.home })), ...(as?.trends ?? []).map((t) => ({ t, team: f.away }))]
    .sort((a, b) => b.t.n - a.t.n)[0];
  if (streak) out.push(`Notable run: ${streak.team}, ${trendText(streak.t).toLowerCase()} in the league.`);
  const tip = topTip(f.p);
  out.push(`FootballSeer's pick: ${LABELS[tip.key] ?? tip.key}, ${pct(tip.p)}.`);
  return out;
}

export function faq(f: Fixture): { q: string; a: string }[] {
  const tip = topTip(f.p);
  return [
    { q: `What are the 1X2 probabilities for ${f.home} v ${f.away}?`, a: `${f.home} ${pct(f.p["1"])}, draw ${pct(f.p.X)}, ${f.away} ${pct(f.p["2"])}.` },
    { q: "What are the over/under 2.5 goals probabilities?", a: `Over 2.5: ${pct(f.p["O2.5"])}. Under 2.5: ${pct(f.p["U2.5"])}.` },
    { q: "Will both teams score?", a: `Yes: ${pct(f.p.BTTS_Y)}. No: ${pct(f.p.BTTS_N)}.` },
    {
      q: "What are the most likely scores?",
      a: f.scores.slice(0, 3).map((s, i) => `${i + 1}) ${s.score} (${pct(s.p, 1)})`).join("  "),
    },
    { q: "What is the FootballSeer prediction?", a: `The likeliest of the main markets is ${LABELS[tip.key] ?? tip.key} at ${pct(tip.p)}.` },
  ];
}

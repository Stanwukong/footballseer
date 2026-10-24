import { formatDay, ordinal, pct } from "../format";
import { marketName, signed, streakText, topTip, trendText, winPct } from "./format";
import type { Fixture, FixtureSlim, H2H, StandingRow, TeamStats } from "./types";

export function h2hSummary(h2h: H2H[], home: string) {
  let hw = 0, aw = 0, pts = 0;
  for (const [, h, , hg, ag] of h2h) {
    pts += hg + ag;
    if ((hg > ag) === (h === home)) hw++;
    else aw++;
  }
  return { hw, aw, avg: h2h.length ? pts / h2h.length : 0 };
}

const record = (r?: StandingRow) => (r ? `${r.all[1]}–${r.all[2]}` : "");

/** A short written preview, built only from the model and the record. */
export function previewParagraphs(f: Fixture | FixtureSlim, hs: TeamStats | undefined, as: TeamStats | undefined, table: StandingRow[], tz = ""): string[] {
  const out: string[] = [];
  const row = (t: string) => table.find((r) => r.team === t);
  const pos = (t: string) => table.findIndex((r) => r.team === t) + 1;
  const rh = row(f.home), ra = row(f.away);
  out.push(
    `${f.away} visit ${f.home} on ${formatDay(f.date)} at ${f.time}${tz ? ` ${tz}` : ""}${f.neutral ? ", at a neutral venue" : ""}.` +
      (rh && ra && rh.all[0] && ra.all[0] ? ` ${f.home} are ${record(rh)} (${ordinal(pos(f.home))}) and ${f.away} ${record(ra)} (${ordinal(pos(f.away))}).` : ""),
  );
  const fav = f.p["1"] >= f.p["2"] ? f.home : f.away;
  const margin = Math.abs(f.pts[0] - f.pts[1]);
  out.push(
    `The model makes ${fav} ${margin < 1.5 ? "the narrowest of favourites" : `${margin.toFixed(1)}-point favourites`}, with a ${pct(Math.max(f.p["1"], f.p["2"]))} chance of winning. ` +
      `It expects a final score around ${Math.round(f.pts[0])}–${Math.round(f.pts[1])}, ${Math.round(f.pts[0] + f.pts[1])} points in all.`,
  );
  if (f.lines.src !== "model") {
    out.push(
      `Against the bookmaker's lines, ${f.home} ${signed(f.lines.sp)} covers ${pct(f.p.SP_H)} of the time and the game goes over ${f.lines.to} ${pct(f.p.TO_O)}.`,
    );
  }
  if (hs?.streak && as?.streak) out.push(`${f.home}: ${streakText(hs.streak).toLowerCase()} in a row, form ${hs.form}. ${f.away}: ${streakText(as.streak).toLowerCase()}, form ${as.form}.`);
  if (hs && as) {
    const h10 = hs.rates.l10, a10 = as.rates.l10;
    if (h10.n && a10.n) {
      out.push(
        `Over their last ${h10.n}, ${f.home} scored ${((h10.pf ?? 0) / h10.n).toFixed(1)} and allowed ${((h10.pa ?? 0) / h10.n).toFixed(1)} a game; ` +
          `${f.away} scored ${((a10.pf ?? 0) / a10.n).toFixed(1)} and allowed ${((a10.pa ?? 0) / a10.n).toFixed(1)}.`,
      );
    }
    const home = hs.rates.home, away = as.rates.away;
    if (home.n >= 2 && away.n >= 2 && home.c && away.c) {
      out.push(`At home this season ${f.home} are ${home.c.W}–${home.n - home.c.W} (${winPct(home.c.W, home.n)}); on the road ${f.away} are ${away.c.W}–${away.n - away.c.W}.`);
    }
  }
  if ("h2h" in f && f.h2h.length) {
    const s = h2hSummary(f.h2h, f.home);
    const [d, h, a, hg, ag] = f.h2h[0];
    out.push(`${f.home} won ${s.hw} of the last ${f.h2h.length} meetings, averaging ${s.avg.toFixed(0)} points a game. The latest, on ${formatDay(d)}: ${h} ${hg}–${ag} ${a}.`);
  }
  const streak = [...(hs?.trends ?? []).map((t) => ({ t, team: f.home })), ...(as?.trends ?? []).map((t) => ({ t, team: f.away }))].sort((a, b) => b.t.n - a.t.n)[0];
  if (streak) out.push(`Notable run: ${streak.team}, ${trendText(streak.t).toLowerCase()}.`);
  const tip = topTip(f.p);
  out.push(`BasketballSeer's pick: ${marketName(tip.key, f.lines, f.home, f.away)}, ${pct(tip.p)}.`);
  return out;
}

export function faq(f: Fixture): { q: string; a: string }[] {
  const tip = topTip(f.p);
  return [
    { q: `Who will win ${f.away} at ${f.home}?`, a: `${f.home} ${pct(f.p["1"])}, ${f.away} ${pct(f.p["2"])}.` },
    { q: "What is the predicted score?", a: `About ${Math.round(f.pts[0])}–${Math.round(f.pts[1])}: ${Math.round(f.pts[0] + f.pts[1])} points in total, a margin of ${Math.abs(f.pts[0] - f.pts[1]).toFixed(1)}.` },
    { q: `Will ${f.home} cover ${signed(f.lines.sp)}?`, a: `${pct(f.p.SP_H)} yes, ${pct(f.p.SP_A)} no${f.lines.src === "model" ? " (the model's own line; no bookmaker line yet)" : ""}.` },
    { q: `Over or under ${f.lines.to} points?`, a: `Over ${pct(f.p.TO_O)}, under ${pct(f.p.TO_U)}.` },
    { q: "What is the BasketballSeer prediction?", a: `The likeliest of the main markets is ${marketName(tip.key, f.lines, f.home, f.away)} at ${pct(tip.p)}.` },
  ];
}

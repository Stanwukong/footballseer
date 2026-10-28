import "server-only";

import { getFixtures as getBasketball } from "./basketball/data";
import type { Fixture as BasketballFixture } from "./basketball/types";
import { getFixtures as getFootball } from "./data";
import { sameSide } from "./names";
import type { Country } from "./sporty-countries";
import type { Sport } from "./nav";
import { getMatches, getPlayerStats, getRatings } from "./tennis/data";
import { ratingIndex, tourOf } from "./tennis/live";
import { price, setChance } from "./tennis/model";
import { headToHead } from "./tennis/players";
import type { RatedPlayer } from "./tennis/types";
import type { Fixture, Slip, SlipLeg } from "./types";

/*
 * A SportyBet booking code is a shared bet slip. SportyBet's site loads one
 * from GET /api/{country}/orders/share/{code} (no key): each outcome is an
 * event with the one market and the one outcome picked. Each pick is priced
 * here by the model for its sport, where we cover the match and the market:
 *
 *   football    1X2, double chance, draw no bet, totals, team totals, both
 *               teams to score, correct score, odd/even and handicaps from the
 *               score matrix; half-time 1X2, totals and both-score
 *   basketball  winner, handicap and total (normal on the model's margin and
 *               total), team totals at the model's line
 *   tennis      winner, set winner, set handicap, total sets, correct score
 *               and "to win a set" from the Elo price, sets played as
 *               independent with the per-set chance that gives that price
 *
 * Sportradar market and outcome ids, as SportyBet lists them, pick the market.
 */

const SPORT: Record<string, Sport> = { "sr:sport:1": "football", "sr:sport:2": "basketball", "sr:sport:5": "tennis" };
const SLAMS = /australian open|french open|roland garros|wimbledon|us open/i;

export class CodeError extends Error {}

// SportyBet payloads are loosely typed; we read only what we need.
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function decodeCode(code: string, country: Country): Promise<Slip> {
  if (!/^[A-Za-z0-9]{4,12}$/.test(code)) throw new CodeError("A booking code is letters and numbers only.");
  const res = await fetch(`https://www.sportybet.com/api/${country}/orders/share/${encodeURIComponent(code.toUpperCase())}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "footballseer/0.1" },
  });
  if (!res.ok) throw new Error(`${res.status} orders/share`);
  const body = (await res.json()) as any;
  if (body?.bizCode !== 10000) throw new CodeError(body?.message || "SportyBet doesn't recognise that code.");
  const outcomes: any[] = body.data?.outcomes ?? [];
  if (!outcomes.length) throw new CodeError("That code has no selections.");

  const [football, basketball, ratings, stats, matches] = await Promise.all([getFootball(), getBasketball(), getRatings(), getPlayerStats(), getMatches()]);
  const findPlayer = ratingIndex(ratings.players);
  const tennis = { ratings, stats, matches, findPlayer };

  const legs = outcomes.map((e) => {
    const leg = baseLeg(e);
    const m = e.markets?.[0], o = m?.outcomes?.[0];
    const sel = { market: String(m?.id ?? ""), spec: specifier(m?.specifier), outcome: String(o?.id ?? ""), desc: String(o?.desc ?? "") };
    if (leg.sport === "football") priceFootball(leg, football, sel);
    else if (leg.sport === "basketball") priceBasketball(leg, basketball, sel);
    else if (leg.sport === "tennis") priceTennis(leg, tennis, sel, e);
    else leg.note = `We don't model ${leg.sportName.toLowerCase() || "this sport"}.`;
    return leg;
  });
  return { code: code.toUpperCase(), country, legs, odds: legs.reduce((a, l) => a * l.odds, 1) };
}

function baseLeg(e: any): SlipLeg {
  const m = e.markets?.[0], o = m?.outcomes?.[0];
  const prob = Number(o?.probability);
  const status = Number(e.status ?? 0);
  return {
    eventId: String(e.eventId ?? ""),
    sport: SPORT[e.sport?.id] ?? null,
    sportName: e.sport?.name ?? "",
    competition: [e.sport?.category?.name, e.sport?.category?.tournament?.name].filter(Boolean).join(" · "),
    start: new Date(Number(e.estimateStartTime) || Date.now()).toISOString(),
    // SportyBet: 0 not started, 1 in play, anything else over (ended, abandoned).
    state: status === 0 ? "pre" : status === 1 ? "in" : "post",
    home: e.homeTeamName ?? "",
    away: e.awayTeamName ?? "",
    market: m?.desc ?? "",
    pick: o?.desc ?? "",
    odds: Number(o?.odds) || 1,
    book: Number.isFinite(prob) && prob > 0 && prob < 1 ? prob : null,
    model: null,
    note: null,
    links: [],
    context: [],
  };
}

type Sel = { market: string; spec: Record<string, string>; outcome: string; desc: string };
type Price = { p: number; push: number };

/** "total=2.5|setnr=1" -> { total: "2.5", setnr: "1" } */
function specifier(s: unknown): Record<string, string> {
  return Object.fromEntries(
    String(s ?? "")
      .split("|")
      .filter(Boolean)
      .map((kv) => kv.split("=") as [string, string]),
  );
}

/**
 * A line bet settled on x + line (x is the goals, points or sets for the side backed):
 * wins above zero, void at zero. Quarter lines split the stake over the two lines next to them.
 */
function lineBet(dist: (x: number) => number, xs: number[], line: number): Price {
  if (Math.abs((line * 4) % 2) === 1) {
    const a = lineBet(dist, xs, line - 0.25), b = lineBet(dist, xs, line + 0.25);
    return { p: (a.p + b.p) / 2, push: (a.push + b.push) / 2 };
  }
  let p = 0, push = 0;
  for (const x of xs) {
    const q = dist(x);
    if (x + line > 1e-9) p += q;
    else if (Math.abs(x + line) <= 1e-9) push += q;
  }
  return { p, push };
}

// --------------------------------------------------------------------------- //
// Football: the score matrix
// --------------------------------------------------------------------------- //

/** Our fixture for a SportyBet event: both sides' names match, within a day of the start. */
function findFootball(fixtures: Fixture[], home: string, away: string, start: string) {
  const at = Date.parse(start);
  return fixtures.find((f) => Math.abs(Date.parse(`${f.date}T${f.time ?? "12:00"}:00Z`) - at) < 36 * 3_600_000 && sameSide(f.home, home) && sameSide(f.away, away));
}

function priceFootball(leg: SlipLeg, fixtures: Fixture[], s: Sel) {
  const f = findFootball(fixtures, leg.home, leg.away, leg.start);
  if (!f) {
    leg.note = "This match isn't in our football model (we cover 38 leagues).";
    return;
  }
  leg.links.push({ label: "Match prediction", href: `/match/${f.id}` });
  leg.context.push(`Expected goals ${f.xg[0].toFixed(2)}–${f.xg[1].toFixed(2)}`);
  const m = footballPrice(f, s);
  if (m && Number.isFinite(m.p) && Number.isFinite(m.push)) leg.model = m;
  else leg.note = "We don't price this market.";
}

function footballPrice(f: Fixture, s: Sel): Price | null {
  const total = f.matrix.flat().reduce((a, b) => a + b, 0) || 1;
  const cells: { h: number; a: number; q: number }[] = [];
  f.matrix.forEach((row, h) => row.forEach((q, a) => cells.push({ h, a, q: q / total })));
  const sum = (ok: (h: number, a: number) => boolean) => cells.reduce((t, c) => t + (ok(c.h, c.a) ? c.q : 0), 0);
  const win = (p: number): Price => ({ p, push: 0 });
  // A line bet on some count from the matrix (the total, a margin); `dir` -1 backs "under".
  const line = (x: (h: number, a: number) => number, ln: number, dir: 1 | -1) => {
    const dist = new Map<number, number>();
    for (const c of cells) dist.set(dir * x(c.h, c.a), (dist.get(dir * x(c.h, c.a)) ?? 0) + c.q);
    return lineBet((v) => dist.get(v) ?? 0, [...dist.keys()], dir === 1 ? -ln : ln);
  };
  const ln = Number(s.spec.total ?? s.spec.hcp);
  const p = (k: string) => f.p[k];
  const ht = (k: string) => (p(k) != null ? win(p(k)) : null);

  // Where the model publishes the market itself, use its number, so the slip agrees with the match page.
  const over = s.outcome === "12";
  const published = {
    "18": `${over ? "O" : "U"}${ln}`,
    "19": over ? `H_O${ln}` : "",
    "20": over ? `A_O${ln}` : "",
    "29": s.outcome === "74" ? "BTTS_Y" : "BTTS_N",
  }[s.market];
  if (published && p(published) != null) return win(p(published));

  switch (s.market) {
    case "1":
      return win({ "1": p("1"), "2": p("X"), "3": p("2") }[s.outcome] ?? NaN);
    case "10":
      return win({ "9": p("1X"), "10": p("12"), "11": p("X2") }[s.outcome] ?? NaN);
    case "11":
      return s.outcome === "4" ? { p: p("1"), push: p("X") } : s.outcome === "5" ? { p: p("2"), push: p("X") } : null;
    case "18":
      return Number.isFinite(ln) ? line((h, a) => h + a, ln, s.outcome === "12" ? 1 : -1) : null;
    case "19":
      return Number.isFinite(ln) ? line((h) => h, ln, s.outcome === "12" ? 1 : -1) : null;
    case "20":
      return Number.isFinite(ln) ? line((_, a) => a, ln, s.outcome === "12" ? 1 : -1) : null;
    case "29":
      return win(s.outcome === "74" ? sum((h, a) => h > 0 && a > 0) : sum((h, a) => h === 0 || a === 0));
    case "26":
      return win(sum((h, a) => (h + a) % 2 === (s.outcome === "70" ? 1 : 0)));
    case "45": {
      const m = /^(\d+):(\d+)$/.exec(s.desc);
      // The matrix is cut off at five goals a side, so bigger scores aren't priced.
      return m && Math.max(Number(m[1]), Number(m[2])) < f.matrix.length - 1 ? win(sum((h, a) => h === Number(m[1]) && a === Number(m[2]))) : null;
    }
    case "16": {
      if (!Number.isFinite(ln)) return null;
      // hcp is the home side's: home backs (h - a) + hcp, away backs (a - h) - hcp.
      return s.outcome === "1714" ? line((h, a) => h - a, -ln, 1) : line((h, a) => a - h, ln, 1);
    }
    case "14": {
      const [hh, ah] = String(s.spec.hcp ?? "").split(":").map(Number);
      if (!Number.isFinite(hh) || !Number.isFinite(ah)) return null;
      const d = (h: number, a: number) => h + hh - (a + ah);
      return win(s.outcome === "1711" ? sum((h, a) => d(h, a) > 0) : s.outcome === "1712" ? sum((h, a) => d(h, a) === 0) : sum((h, a) => d(h, a) < 0));
    }
    case "60":
      return ht({ "1": "HT_1", "2": "HT_X", "3": "HT_2" }[s.outcome] ?? "");
    case "63": {
      const [h1, x, h2] = [p("HT_1"), p("HT_X"), p("HT_2")];
      if (h1 == null || x == null || h2 == null) return null;
      return win({ "9": h1 + x, "10": h1 + h2, "11": x + h2 }[s.outcome] ?? NaN);
    }
    case "68":
    case "90": {
      const key = `${s.market === "68" ? "HT" : "2H"}_O${ln}`;
      if (p(key) == null) return null;
      return win(s.outcome === "12" ? p(key) : 1 - p(key));
    }
    case "75":
      return p("HT_BTTS_Y") == null ? null : win(s.outcome === "74" ? p("HT_BTTS_Y") : 1 - p("HT_BTTS_Y"));
    default:
      return null;
  }
}

// --------------------------------------------------------------------------- //
// Basketball: normal margin and total around the model's expected points
// --------------------------------------------------------------------------- //

const erf = (x: number) => {
  // Abramowitz and Stegun 7.1.26, good to 1.5e-7.
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
const above = (x: number, mean: number, sd: number) => 0.5 * (1 - erf((x - mean) / (sd * Math.SQRT2)));

function priceBasketball(leg: SlipLeg, fixtures: BasketballFixture[], s: Sel) {
  const at = Date.parse(leg.start);
  const f = fixtures.find((x) => Math.abs(Date.parse(x.kickoff) - at) < 3 * 3_600_000 && sameSide(x.home, leg.home) && sameSide(x.away, leg.away));
  if (!f) {
    leg.note = "This game isn't in our basketball model.";
    return;
  }
  leg.links.push({ label: "Game prediction", href: `/basketball/match/${f.id}` });
  leg.context.push(`Expected score ${Math.round(f.pts[0])}–${Math.round(f.pts[1])}`);
  const [margin, total] = [f.pts[0] - f.pts[1], f.pts[0] + f.pts[1]];
  const ln = Number(s.spec.total ?? s.spec.hcp);
  const ladder = (rows: [number, number][], at: number) => rows.find(([l]) => Math.abs(l - at) < 1e-9)?.[1];
  const regular = ["16", "18", "19", "20"].includes(s.market);

  let p: number | undefined;
  switch (s.market) {
    case "219":
      p = s.outcome === "4" ? f.p["1"] : s.outcome === "5" ? f.p["2"] : undefined;
      break;
    case "223":
    case "16": {
      if (!Number.isFinite(ln)) break;
      // The ladder gives P(home margin + line > 0) at the lines the model priced.
      const home = ladder(f.ladders.spread, ln) ?? above(-ln, margin, f.sd[0]);
      p = s.outcome === "1714" ? home : s.outcome === "1715" ? 1 - home : undefined;
      break;
    }
    case "225":
    case "18": {
      if (!Number.isFinite(ln)) break;
      const over = ladder(f.ladders.total, ln) ?? above(ln, total, f.sd[1]);
      p = s.outcome === "12" ? over : s.outcome === "13" ? 1 - over : undefined;
      break;
    }
    case "227":
    case "19":
    case "228":
    case "20": {
      const home = s.market === "227" || s.market === "19";
      if (Math.abs(ln - (home ? f.lines.ht : f.lines.at)) > 1e-9) break;
      const over = f.p[home ? "HT_O" : "AT_O"];
      p = over == null ? undefined : s.outcome === "12" ? over : 1 - over;
      break;
    }
  }
  if (p == null || !Number.isFinite(p)) {
    leg.note = s.market === "227" || s.market === "228" || s.market === "19" || s.market === "20" ? "We price team totals only at our own line." : "We don't price this market.";
    return;
  }
  leg.model = { p, push: 0 };
  if (regular) leg.note = "This market leaves out overtime; our price includes it.";
}

// --------------------------------------------------------------------------- //
// Tennis: Elo, then sets as independent trials
// --------------------------------------------------------------------------- //

/** "Djokovic, Novak" -> "Novak Djokovic" */
const displayName = (s: string) => (s.includes("/") || !s.includes(",") ? s : s.split(",").reverse().map((x) => x.trim()).join(" "));

/** Chance the first player wins the match a sets to b, with per-set chance s. */
function score(a: number, b: number, need: number, s: number) {
  const binom = (n: number, k: number) => {
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
  };
  if (a === need && b < need) return binom(need - 1 + b, b) * s ** need * (1 - s) ** b;
  if (b === need && a < need) return binom(need - 1 + a, a) * (1 - s) ** need * s ** a;
  return 0;
}

type TennisData = {
  ratings: Awaited<ReturnType<typeof getRatings>>;
  stats: Awaited<ReturnType<typeof getPlayerStats>>;
  matches: Awaited<ReturnType<typeof getMatches>>;
  findPlayer: (name: string, tour: RatedPlayer["tour"]) => RatedPlayer | undefined;
};

function priceTennis(leg: SlipLeg, t: TennisData, s: Sel, e: any) {
  const tournament = e.sport?.category?.tournament?.name ?? "";
  const category = e.sport?.category?.name ?? "";
  if (leg.home.includes("/") || /doubles/i.test(tournament)) {
    leg.note = "We rate singles players only.";
    return;
  }
  const tour = tourOf(category, tournament);
  const names = [displayName(leg.home), displayName(leg.away)];
  [leg.home, leg.away] = names;
  const [a, b] = names.map((n) => t.findPlayer(n, tour));
  for (const [k, pl] of [a, b].entries()) {
    if (!pl) continue;
    leg.links.push({ label: pl.name, href: `/tennis/players/${pl.id}` });
    const st = t.stats.players[pl.id];
    const bits = [`${pl.name.split(" ").at(-1)}: Elo ${Math.round(pl.elo)} (#${pl.rank})`];
    if (st) bits.push(`${st.year[0]}–${st.year[1]} in the last year`, `streak ${st.streak}`);
    leg.context.push(bits.join(" · "));
    if (k === 1 && a && b) {
      const h2h = headToHead(t.matches, a.id, b.id, t.ratings.scale);
      if (h2h.length) leg.context.push(`Head to head ${h2h.filter((m) => m.won).length}–${h2h.filter((m) => !m.won).length}`);
    }
  }
  if (!a || !b || a.id === b.id) {
    leg.note = `We haven't rated ${!a && !b ? "either player" : !a ? names[0] : names[1]}: we rate ATP and WTA tour-level players.`;
    return;
  }

  const bestOf = SLAMS.test(tournament) && !/women/i.test(tournament) ? 5 : 3;
  const need = bestOf === 5 ? 3 : 2;
  const p3 = price(a.elo - b.elo, 3, t.ratings.scale);
  const set = setChance(p3);
  const match = bestOf === 5 ? price(a.elo - b.elo, 5, t.ratings.scale) : p3;
  // Every finishing score, home's sets first.
  const scores: [number, number, number][] = [];
  for (let k = 0; k < need; k++) scores.push([need, k, score(need, k, need, set)], [k, need, score(k, need, need, set)]);
  const sets = (ok: (x: number, y: number) => boolean) => scores.reduce((sum, [x, y, q]) => sum + (ok(x, y) ? q : 0), 0);
  const home = s.outcome === "4" || s.outcome === "1714" || s.outcome === "1";
  const ln = Number(s.spec.total ?? s.spec.hcp);

  let p: number | undefined;
  switch (s.market) {
    case "186":
      p = home ? match : 1 - match;
      break;
    case "202":
      p = home ? set : 1 - set;
      break;
    case "188":
      if (Number.isFinite(ln)) p = home ? sets((x, y) => x - y + ln > 0) : sets((x, y) => y - x - ln > 0);
      break;
    case "314":
      if (Number.isFinite(ln)) p = s.outcome === "12" ? sets((x, y) => x + y > ln) : sets((x, y) => x + y < ln);
      break;
    case "199": {
      const m = /^(\d):(\d)$/.exec(s.desc);
      if (m) p = sets((x, y) => x === Number(m[1]) && y === Number(m[2]));
      break;
    }
    case "192":
    case "193": {
      const mine = s.market === "192";
      const yes = 1 - sets((x, y) => (mine ? x === 0 : y === 0));
      p = s.outcome === "74" ? yes : 1 - yes;
      break;
    }
  }
  if (p == null) {
    leg.note = "We price match, set and set-score markets only, not games.";
    return;
  }
  leg.model = { p, push: 0 };
  if (s.market !== "186") leg.note = "Set markets treat each set as an even repeat of the match odds.";
}

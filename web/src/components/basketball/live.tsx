"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { LiveDot, StatBar } from "@/components/live";
import { Segmented } from "@/components/TeamTables";
import { Card, CountryTag, cx, EmptyState, ProbPill, ResultMark } from "@/components/ui";
import { liveSettle, marketName, topTip } from "@/lib/basketball/format";
import { liveState } from "@/lib/basketball/model";
import type { Fixture, FixtureSlim, LeagueInfo, LiveEvent } from "@/lib/basketball/types";
import { formatDay, pct } from "@/lib/format";
import { useBasketballDetail, useBasketballFeed } from "@/lib/live-client";

/** Clock or state, red while in play. */
export function GameStatus({ e, className = "" }: { e: LiveEvent; className?: string }) {
  if (e.state === "in") {
    return (
      <span className={cx("inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold whitespace-nowrap text-bad tabular", className)}>
        <LiveDot />
        {e.status}
      </span>
    );
  }
  return <span className={cx("font-mono text-[11px] text-ink-2 tabular", className)}>{e.state === "post" ? e.status || "Final" : e.status}</span>;
}

/** Points per period, home on top, with OT columns when played. */
export function Linescore({ e, home, away, periods }: { e: LiveEvent; home: string; away: string; periods: number }) {
  const n = Math.max(periods, e.periods[0].length, e.periods[1].length);
  const head = Array.from({ length: n }, (_, i) => (i < periods ? (periods === 2 ? `H${i + 1}` : `Q${i + 1}`) : i === periods ? "OT" : `${i - periods + 1}OT`));
  return (
    <table className="w-full text-sm tabular">
      <thead className="text-[11px] tracking-wider text-ink-3 uppercase">
        <tr className="border-b border-line">
          <th className="py-1.5 text-left font-medium">Team</th>
          {head.map((h) => <th key={h} className="w-10 py-1.5 text-right font-medium">{h}</th>)}
          <th className="w-12 py-1.5 text-right font-medium">T</th>
        </tr>
      </thead>
      <tbody>
        {([[home, 0], [away, 1]] as const).map(([t, i]) => (
          <tr key={t} className="border-b border-line last:border-0">
            <td className="max-w-0 truncate py-1.5 pr-2">{t}</td>
            {head.map((h, k) => <td key={h} className="py-1.5 text-right text-ink-2">{e.periods[i][k] ?? "–"}</td>)}
            <td className="py-1.5 text-right font-semibold">{e.score[i]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The match header's centre: tip-off time before, live score during and after. */
export function HeaderScore({ fixture, tz }: { fixture: Pick<Fixture, "id" | "time" | "date">; tz?: string }) {
  const { byFixture } = useBasketballFeed();
  const e = byFixture.get(fixture.id);
  if (!e || e.state === "pre") {
    return (
      <div className="text-center">
        <div className="font-display text-2xl font-semibold tabular sm:text-3xl">{fixture.time}</div>
        <div className="mt-1 font-mono text-[11px] tracking-wider text-ink-3 uppercase">{formatDay(fixture.date)}{tz ? ` · ${tz}` : ""}</div>
      </div>
    );
  }
  return (
    <div className="text-center">
      <div className="font-display text-3xl font-semibold tabular sm:text-4xl">
        {e.score[0]}<span className="mx-1.5 text-ink-3">–</span>{e.score[1]}
      </div>
      <div className="mt-1.5 flex justify-center"><GameStatus e={e} /></div>
    </div>
  );
}

/** Live panel on the match page: in-play probabilities, linescore, team stats, box score, scoring plays. */
export function MatchLive({ fixture, periods }: { fixture: Fixture; periods: number }) {
  const { byFixture, error: feedError } = useBasketballFeed();
  const feed = byFixture.get(fixture.id);
  const { detail } = useBasketballDetail(fixture.live, feed?.state);
  const [tab, setTab] = useState<"stats" | "box" | "plays">("stats");
  const e = detail?.event ?? feed;
  if (!e || e.state === "pre") {
    return feedError ? null : (
      <p className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-2 shadow-card">
        <span className="size-2 rounded-full bg-line-strong" aria-hidden />
        Live score, quarter scores and the box score appear here from tip-off.
      </p>
    );
  }
  const live = e.state === "in";
  const ip = liveState(fixture, e);
  const tip = topTip(fixture.p);
  const won = liveSettle(tip.key, e, fixture.lines);
  const tipNow = ip.p[tip.key];
  const hasBox = !!detail && (detail.stats.length > 0 || detail.players.length > 0);

  return (
    <Card
      id="live"
      title={<span className="flex items-center gap-2">{live ? <><LiveDot /> Live</> : "Final"}</span>}
      hint={`${e.home} ${e.score[0]}–${e.score[1]} ${e.away} · ${e.status} · refreshed every 30 seconds`}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <Linescore e={e} home={fixture.home} away={fixture.away} periods={periods} />
          <div className="grid grid-cols-3 gap-2 text-center">
            <Mini label={live ? `${fixture.home} win now` : `${fixture.home} won`} value={live ? pct(ip.p["1"]) : e.score[0] > e.score[1] ? "Yes" : "No"} />
            <Mini label={live ? `Over ${fixture.lines.to} now` : `Total vs ${fixture.lines.to}`} value={live ? pct(ip.p.TO_O) : `${e.score[0] + e.score[1]}`} />
            <Mini label={live ? "Projected final" : "Pre-game expected"} value={live ? `${Math.round(ip.final[0])}–${Math.round(ip.final[1])}` : `${Math.round(fixture.pts[0])}–${Math.round(fixture.pts[1])}`} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 text-sm">
            <span className="min-w-0 truncate">
              <span className="text-ink-3">Pre-game pick · </span>
              <span className="font-medium">{marketName(tip.key, fixture.lines, fixture.home, fixture.away)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-ink-3 tabular">{pct(tip.p)} →</span>
              {won !== undefined ? <ResultMark won={won} /> : tipNow != null ? <ProbPill p={tipNow} size="sm" /> : <span className="text-xs text-ink-3">–</span>}
            </span>
          </div>
          {e.leaders.some(Boolean) && (
            <p className="text-sm text-ink-2">
              Top scorers: {e.leaders.map((l, i) => l && <span key={i} className="mr-3"><span className="font-medium text-ink">{l[0]}</span> {l[1]}</span>)}
            </p>
          )}
        </div>

        <div className="min-w-0">
          {hasBox ? (
            <>
              <Segmented label="Live view" value={tab} onChange={setTab} options={[{ id: "stats", label: "Team stats" }, { id: "box", label: "Box score" }, { id: "plays", label: "Scoring" }]} />
              <div className="mt-4">
                {tab === "stats" && (
                  <div className="space-y-3">
                    {detail!.stats.slice(0, 14).map(([label, h, a]) => (
                      <StatBar key={label} label={label} home={parseFloat(h)} away={parseFloat(a)} suffix={label.includes("%") ? "%" : ""} />
                    ))}
                  </div>
                )}
                {tab === "box" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(["home", "away"] as const).map((side) => {
                      const rows = detail!.players.find((p) => p.side === side)?.rows ?? [];
                      return (
                        <div key={side} className="min-w-0">
                          <div className="mb-1.5 truncate text-sm font-semibold">{side === "home" ? fixture.home : fixture.away}</div>
                          <table className="w-full text-xs tabular">
                            <thead className="text-[10px] tracking-wider text-ink-3 uppercase">
                              <tr className="border-b border-line"><th className="py-1 text-left font-medium">Player</th><th className="py-1 text-right font-medium">Min</th><th className="py-1 text-right font-medium">Pts</th><th className="py-1 text-right font-medium">Reb</th><th className="py-1 text-right font-medium">Ast</th></tr>
                            </thead>
                            <tbody>
                              {rows.slice(0, 10).map(([n, min, pts, reb, ast]) => (
                                <tr key={n} className="border-b border-line/60 last:border-0">
                                  <td className="max-w-0 truncate py-1 pr-1">{n}</td>
                                  <td className="py-1 text-right text-ink-3">{min}</td>
                                  <td className="py-1 text-right font-semibold">{pts}</td>
                                  <td className="py-1 text-right">{reb}</td>
                                  <td className="py-1 text-right">{ast}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}
                {tab === "plays" && (
                  detail!.plays.length ? (
                    <ol className="max-h-96 space-y-2 overflow-y-auto pr-1">
                      {detail!.plays.map((p, i) => (
                        <li key={i} className="grid grid-cols-[3.5rem_1fr_3.5rem] gap-2 text-sm">
                          <span className="font-mono text-[11px] text-ink-3">{p.period > periods ? "OT" : periods === 2 ? `H${p.period}` : `Q${p.period}`} {p.clock}</span>
                          <span className="text-ink-2">{p.text}</span>
                          <span className="text-right font-mono text-[11px] text-ink-3">{p.score}</span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-sm text-ink-3">No play-by-play for this game.</p>
                )}
              </div>
            </>
          ) : e.stats ? (
            <div className="space-y-3">
              {Object.keys(e.stats.home).map((k) => <StatBar key={k} label={k} home={e.stats!.home[k]} away={e.stats!.away[k]} suffix={k.includes("%") ? "%" : ""} />)}
            </div>
          ) : (
            <p className="text-sm text-ink-3">No box score from this league&apos;s feed; quarter scores update as they finish.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-2">
      <div className="font-display text-lg font-semibold tabular">{value}</div>
      <div className="truncate text-[11px] text-ink-3">{label}</div>
    </div>
  );
}

type Linked = Pick<FixtureSlim, "id" | "home" | "away" | "league" | "pts" | "sd" | "lines" | "p">;

/** Every game today in the leagues we cover: in play, finished, and still to come. */
export function LiveBoard({ fixtures, leagues }: { fixtures: Linked[]; leagues: LeagueInfo[] }) {
  const { feed, error } = useBasketballFeed();
  const [chosen, setView] = useState<"in" | "post" | "pre" | null>(null);
  const byCode = useMemo(() => Object.fromEntries(leagues.map((l) => [l.code, l])), [leagues]);
  const byId = useMemo(() => new Map(fixtures.map((f) => [f.id, f])), [fixtures]);
  const events = feed?.events ?? [];
  const counts = { in: 0, post: 0, pre: 0 };
  for (const e of events) counts[e.state]++;
  const view = chosen ?? (counts.in ? "in" : counts.pre ? "pre" : "post");
  const shown = events.filter((e) => e.state === view);

  if (!feed) {
    return error ? (
      <EmptyState title="Live data is unavailable">The scoreboards didn&apos;t respond. The page retries every 30 seconds.</EmptyState>
    ) : (
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-surface-2" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Games"
          value={view}
          onChange={setView}
          options={[
            { id: "in", label: `In play · ${counts.in}` },
            { id: "post", label: `Finished · ${counts.post}` },
            { id: "pre", label: `Later today · ${counts.pre}` },
          ]}
        />
        <span className="font-mono text-[11px] text-ink-3 uppercase">
          {error ? "Reconnecting… " : ""}Updated {new Date(feed.updated).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · {feed.source}
        </span>
      </div>
      {shown.length === 0 ? (
        <EmptyState title={view === "in" ? "No games in play" : view === "post" ? "No finished games yet today" : "Nothing else today"}>
          {view === "in" && counts.pre > 0 ? "Games appear here as they tip off." : null}
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((e) => <LiveCard key={e.id} e={e} f={e.fixture ? byId.get(e.fixture) : undefined} league={byCode[e.league]} />)}
        </div>
      )}
    </div>
  );
}

function LiveCard({ e, f, league }: { e: LiveEvent; f?: Linked; league?: LeagueInfo }) {
  const tip = f ? topTip(f.p) : null;
  const ip = f && e.state === "in" ? liveState(f, e) : null;
  const won = tip && f ? liveSettle(tip.key, e, f.lines) : undefined;
  const body = (
    <>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        {league && <CountryTag country={league.country} />}
        <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{league ? `${league.country} · ${league.name}` : e.league}</span>
        {e.state === "pre" ? (
          <span className="font-mono text-[11px] text-ink-2">{new Date(e.kickoff).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
        ) : (
          <GameStatus e={e} />
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 pt-3">
        <span className="truncate font-medium">{f?.home ?? e.home}</span>
        <Pts n={e.state === "pre" ? null : e.score[0]} live={e.state === "in"} />
        <span className="truncate font-medium">{f?.away ?? e.away}</span>
        <Pts n={e.state === "pre" ? null : e.score[1]} live={e.state === "in"} />
      </div>
      {e.state !== "pre" && e.periods[0].length > 0 && (
        <p className="px-4 pt-1.5 font-mono text-[11px] text-ink-3 tabular">
          {e.periods[0].map((h, i) => `${h}-${e.periods[1][i] ?? "–"}`).join("  ")}
        </p>
      )}
      {e.leaders.some(Boolean) && (
        <p className="truncate px-4 pt-1 text-xs text-ink-3">{e.leaders.filter(Boolean).map((l) => `${l![0]} ${l![1]}`).join(" · ")}</p>
      )}
      {tip && f && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line bg-surface-2/50 px-4 py-2.5 text-sm">
          <span className="min-w-0 truncate"><span className="text-ink-3">Pick · </span><span className="font-medium">{marketName(tip.key, f.lines, f.home, f.away)}</span></span>
          <span className="flex shrink-0 items-center gap-2">
            {won !== undefined ? (
              <ResultMark won={won} />
            ) : ip && ip.p[tip.key] != null ? (
              <><span className="text-xs text-ink-3 tabular">{pct(tip.p)} →</span><ProbPill p={ip.p[tip.key]} size="sm" /></>
            ) : (
              <ProbPill p={tip.p} size="sm" />
            )}
          </span>
        </div>
      )}
      {!f && <div className="pb-3" />}
    </>
  );
  const cls = cx("block overflow-hidden rounded-xl border bg-surface shadow-card transition-colors", e.state === "in" ? "border-bad/30" : "border-line", f && "hover:border-line-strong");
  return f ? <Link href={`/basketball/match/${f.id}#live`} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Pts({ n, live }: { n: number | null; live: boolean }) {
  return <span className={cx("text-right font-display text-lg leading-6 font-semibold tabular", live && "text-bad")}>{n ?? ""}</span>;
}

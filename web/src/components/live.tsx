"use client";

import { useState } from "react";

import { ProbBar } from "@/components/ProbBar";
import { Segmented } from "@/components/TeamTables";
import { Card, cx, ProbPill, ResultMark } from "@/components/ui";
import { inPlay } from "@/lib/inplay";
import { formatDay, marketName, pct, topTip } from "@/lib/format";
import { useLiveDetail, useLiveFeed } from "@/lib/live-client";
import { settle } from "@/lib/settle";
import type { Fixture, LiveEvent, LiveIncident, LiveTeamStats } from "@/lib/types";

/** Red pulsing dot, the universal "live" mark. */
export function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span className={cx("relative inline-flex size-2 shrink-0", className)} aria-hidden>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-bad opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-bad" />
    </span>
  );
}

/** Minute or state, styled by state: red while in play, muted when finished. */
export function LiveStatus({ e, className = "" }: { e: LiveEvent; className?: string }) {
  if (e.state === "in") {
    return (
      <span className={cx("inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-bad tabular", className)}>
        <LiveDot />
        {e.status}
      </span>
    );
  }
  return <span className={cx("font-mono text-[11px] text-ink-2 tabular", className)}>{e.state === "post" ? e.status || "FT" : e.status}</span>;
}

const KIND_ICON: Record<LiveIncident["kind"], string> = {
  goal: "⚽", "own-goal": "⚽", penalty: "⚽", "missed-penalty": "✕", yellow: "", red: "", sub: "⇄", period: "", other: "",
};

function IncidentMark({ kind }: { kind: LiveIncident["kind"] }) {
  if (kind === "yellow") return <span className="inline-block h-3.5 w-2.5 rounded-[2px] bg-[#f5c518]" aria-label="Yellow card" />;
  if (kind === "red") return <span className="inline-block h-3.5 w-2.5 rounded-[2px] bg-bad" aria-label="Red card" />;
  return <span aria-hidden className="text-xs">{KIND_ICON[kind]}</span>;
}

function incidentLabel(i: LiveIncident) {
  if (i.kind === "own-goal") return `${i.player ?? "Own goal"} (OG)`;
  if (i.kind === "penalty") return `${i.player ?? "Penalty"} (pen)`;
  if (i.kind === "missed-penalty") return `${i.player ?? ""} missed penalty`;
  if (i.kind === "sub") return i.playerOut ? `${i.player} for ${i.playerOut}` : (i.player ?? "Substitution");
  return i.player ?? i.text;
}

/** Goals and cards, home on the left and away on the right of the minute. */
export function Timeline({ items }: { items: LiveIncident[] }) {
  if (!items.length) return <p className="text-sm text-ink-3">Nothing yet.</p>;
  return (
    <ol className="space-y-1.5">
      {items.map((i, k) => (
        <li key={k} className="grid grid-cols-[1fr_3rem_1fr] items-center gap-2 text-sm">
          <span className={cx("flex items-center justify-end gap-2 text-right", i.side !== "home" && "invisible")}>
            <span className="truncate">{incidentLabel(i)}</span>
            <IncidentMark kind={i.kind} />
          </span>
          <span className="text-center font-mono text-[11px] text-ink-3">{i.minute}</span>
          <span className={cx("flex items-center gap-2", i.side !== "away" && "invisible")}>
            <IncidentMark kind={i.kind} />
            <span className="truncate">{incidentLabel(i)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Two-sided bar for one stat. */
export function StatBar({ label, home, away, suffix = "" }: { label: string; home?: number; away?: number; suffix?: string }) {
  if (home == null && away == null) return null;
  const h = home ?? 0, a = away ?? 0;
  const share = h + a > 0 ? h / (h + a) : 0.5;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm tabular">
        <span className={cx("font-semibold", h > a && "text-ink", h <= a && "text-ink-2")}>{h}{suffix}</span>
        <span className="text-xs text-ink-3">{label}</span>
        <span className={cx("font-semibold", a > h && "text-ink", a <= h && "text-ink-2")}>{a}{suffix}</span>
      </div>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        <div className="rounded-l-full bg-home" style={{ width: `${share * 100}%` }} />
        <div className="flex-1 rounded-r-full bg-away" />
      </div>
    </div>
  );
}

export function StatBars({ s }: { s: { home: LiveTeamStats; away: LiveTeamStats } }) {
  return (
    <div className="space-y-3">
      <StatBar label="Possession" home={s.home.possession} away={s.away.possession} suffix="%" />
      <StatBar label="Shots" home={s.home.shots} away={s.away.shots} />
      <StatBar label="On target" home={s.home.onTarget} away={s.away.onTarget} />
      <StatBar label="Corners" home={s.home.corners} away={s.away.corners} />
      <StatBar label="Fouls" home={s.home.fouls} away={s.away.fouls} />
    </div>
  );
}

/** The match header's centre: kick-off time before, live score during and after. */
export function HeaderScore({ fixture }: { fixture: Pick<Fixture, "id" | "time" | "date"> }) {
  const { byFixture } = useLiveFeed();
  const e = byFixture.get(fixture.id);
  if (!e || e.state === "pre") {
    return (
      <div className="text-center">
        <div className="font-display text-2xl font-semibold tabular sm:text-3xl">{fixture.time ?? "–"}</div>
        <div className="mt-1 font-mono text-[11px] tracking-wider text-ink-3 uppercase">{e?.status && e.status !== fixture.time ? e.status : formatDay(fixture.date)}</div>
      </div>
    );
  }
  return (
    <div className="text-center">
      <div className="font-display text-3xl font-semibold tabular sm:text-4xl">
        {e.score[0]}<span className="mx-1.5 text-ink-3">–</span>{e.score[1]}
      </div>
      <div className="mt-1.5 flex justify-center"><LiveStatus e={e} /></div>
    </div>
  );
}

/** Live panel on the match page: in-play probabilities, stats, timeline, line-ups, commentary. */
export function MatchLive({ fixture }: { fixture: Fixture }) {
  const { byFixture, error: feedError } = useLiveFeed();
  const feed = byFixture.get(fixture.id);
  const { detail } = useLiveDetail(fixture.espn, feed?.state);
  const [tab, setTab] = useState<"stats" | "timeline" | "lineups" | "commentary">("stats");
  if (!fixture.espn) return null;
  const e = detail?.event ?? feed;
  if (!e || e.state === "pre") {
    return feedError ? null : (
      <p className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-2 shadow-card">
        <span className="size-2 rounded-full bg-line-strong" aria-hidden />
        Live score, stats and line-ups appear here from kick-off.
      </p>
    );
  }

  const live = e.state === "in";
  const ip = inPlay(fixture.xg, e.score, live ? e.minute : 95, e.red);
  const tip = topTip(fixture.p);
  const won = e.state === "post" ? settle(tip.key, e.score[0], e.score[1]) : null;
  const tipNow = ip.p[tip.key];

  return (
    <Card
      id="live"
      title={<span className="flex items-center gap-2">{live ? <><LiveDot /> Live</> : "Full time"}</span>}
      hint={`${e.home} ${e.score[0]}–${e.score[1]} ${e.away} · ${e.status} · data from ESPN, refreshed every 30 seconds`}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <div className="eyebrow mb-2">{live ? "Result probability now" : "Result"}</div>
            <ProbBar p={ip.p} home={fixture.home} away={fixture.away} size="lg" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Mini label="Over 2.5" value={pct(ip.p["O2.5"])} />
            <Mini label="Both score" value={pct(ip.p.BTTS_Y)} />
            <Mini label={live ? "Goal still to come" : "Pre-match xG"} value={live ? pct(ip.nextGoal[0] + ip.nextGoal[1]) : `${fixture.xg[0].toFixed(1)}–${fixture.xg[1].toFixed(1)}`} />
          </div>
          {live && (ip.nextGoal[0] + ip.nextGoal[1]) > 0.02 && (
            <div className="text-sm text-ink-2">
              Next goal: <span className="font-semibold text-ink">{fixture.home} {pct(ip.nextGoal[0])}</span> · <span className="font-semibold text-ink">{fixture.away} {pct(ip.nextGoal[1])}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 text-sm">
            <span className="min-w-0 truncate">
              <span className="text-ink-3">Pre-match pick · </span>
              <span className="font-medium">{marketName(tip.key, fixture.home, fixture.away)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-ink-3 tabular">{pct(tip.p)} →</span>
              {e.state === "post" ? <ResultMark won={won} /> : tipNow != null ? <ProbPill p={tipNow} size="sm" /> : <span className="text-xs text-ink-3">–</span>}
            </span>
          </div>
          {e.incidents.length > 0 && (
            <div>
              <div className="eyebrow mb-2">Goals and cards</div>
              <Timeline items={e.incidents} />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <Segmented
            label="Live view"
            value={tab}
            onChange={setTab}
            options={[{ id: "stats", label: "Stats" }, { id: "timeline", label: "Timeline" }, { id: "lineups", label: "Line-ups" }, { id: "commentary", label: "Commentary" }]}
          />
          <div className="mt-4">
            {tab === "stats" && (
              detail?.stats.length ? (
                <div className="space-y-3">
                  {detail.stats.map(([label, h, a]) => (
                    <StatBar key={label} label={label} home={parseFloat(h)} away={parseFloat(a)} suffix={label.includes("%") ? "%" : ""} />
                  ))}
                </div>
              ) : e.stats ? <StatBars s={e.stats} /> : <p className="text-sm text-ink-3">No stats yet.</p>
            )}
            {tab === "timeline" && <Timeline items={detail?.timeline.filter((i) => i.kind !== "period") ?? e.incidents} />}
            {tab === "lineups" && (
              detail?.lineups.length ? (
                <div className="grid grid-cols-2 gap-4">
                  {(["home", "away"] as const).map((side) => {
                    const l = detail.lineups.find((x) => x.side === side);
                    return (
                      <div key={side} className="min-w-0">
                        <div className="mb-2 flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{side === "home" ? fixture.home : fixture.away}</span>
                          {l?.formation && <span className="font-mono text-[11px] text-ink-3">{l.formation}</span>}
                        </div>
                        <ul className="space-y-1 text-sm">
                          {l?.starters.map((p) => (
                            <li key={p.name} className="flex items-center gap-2">
                              <span className="w-5 text-right font-mono text-[11px] text-ink-3">{p.jersey}</span>
                              <span className={cx("min-w-0 truncate", p.subbedOut && "text-ink-3 line-through decoration-ink-3/50")}>{p.name}</span>
                              <span className="ml-auto font-mono text-[10px] text-ink-3">{p.pos}</span>
                            </li>
                          ))}
                        </ul>
                        {l && l.subs.some((p) => p.subbedIn) && (
                          <>
                            <div className="eyebrow mt-3 mb-1">On</div>
                            <ul className="space-y-1 text-sm">
                              {l.subs.filter((p) => p.subbedIn).map((p) => (
                                <li key={p.name} className="flex items-center gap-2">
                                  <span className="w-5 text-right font-mono text-[11px] text-ink-3">{p.jersey}</span>
                                  <span className="min-w-0 truncate text-good">{p.name}</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-sm text-ink-3">Line-ups not published.</p>
            )}
            {tab === "commentary" && (
              detail?.commentary.length ? (
                <ol className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
                  {detail.commentary.map((c, i) => (
                    <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-2 text-sm">
                      <span className="font-mono text-[11px] text-ink-3">{c.minute}</span>
                      <span className="text-ink-2">{c.text}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-ink-3">No commentary for this match.</p>
            )}
          </div>
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

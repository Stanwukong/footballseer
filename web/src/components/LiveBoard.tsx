"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { LiveStatus, StatBars } from "@/components/live";
import { Segmented } from "@/components/TeamTables";
import { CountryTag, cx, EmptyState, ProbPill, ResultMark } from "@/components/ui";
import { inPlay } from "@/lib/inplay";
import { marketName, pct, topTip } from "@/lib/format";
import { useLiveFeed } from "@/lib/live-client";
import { settle } from "@/lib/settle";
import type { FixtureSlim, LeagueInfo, LiveEvent } from "@/lib/types";

type Linked = Pick<FixtureSlim, "id" | "home" | "away" | "xg" | "p">;

/** Every match today in the leagues we cover: in play, finished, and still to come. */
export function LiveBoard({ fixtures, leagues }: { fixtures: Linked[]; leagues: LeagueInfo[] }) {
  const { feed, error } = useLiveFeed();
  const [chosen, setView] = useState<"in" | "post" | "pre" | null>(null);
  const byCode = useMemo(() => Object.fromEntries(leagues.map((l) => [l.code, l])), [leagues]);
  const byId = useMemo(() => new Map(fixtures.map((f) => [f.id, f])), [fixtures]);
  const events = feed?.events ?? [];
  const counts = { in: 0, post: 0, pre: 0 };
  for (const e of events) counts[e.state]++;
  // Open on whatever is happening: in play, else what's still to come, else results.
  const view = chosen ?? (counts.in ? "in" : counts.pre ? "pre" : "post");
  const shown = events.filter((e) => e.state === view);

  if (!feed) {
    return error ? (
      <EmptyState title="Live data is unavailable">ESPN didn&apos;t respond. The page retries every 30 seconds.</EmptyState>
    ) : (
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-44 animate-pulse rounded-xl bg-surface-2" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Matches"
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
        <EmptyState title={view === "in" ? "No matches in play" : view === "post" ? "No finished matches yet today" : "Nothing else today"}>
          {view === "in" && counts.pre > 0 ? "Matches appear here as they kick off." : null}
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((e) => (
            <LiveCard key={e.id} e={e} f={e.fixture ? byId.get(e.fixture) : undefined} league={byCode[e.league]} />
          ))}
        </div>
      )}
    </div>
  );
}

function LiveCard({ e, f, league }: { e: LiveEvent; f?: Linked; league?: LeagueInfo }) {
  const tip = f ? topTip(f.p) : null;
  const ip = f && e.state !== "pre" ? inPlay(f.xg, e.score, e.state === "in" ? e.minute : 95, e.red) : null;
  const won = tip && e.state === "post" ? settle(tip.key, e.score[0], e.score[1]) : null;
  const body = (
    <>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        {league && <CountryTag country={league.country} />}
        <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{league ? `${league.country} · ${league.name}` : e.league}</span>
        {e.state === "pre" ? (
          <span className="font-mono text-[11px] text-ink-2">{new Date(e.kickoff).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
        ) : (
          <LiveStatus e={e} />
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 pt-3">
        <Team name={f?.home ?? e.home} red={e.red[0]} />
        <Goals n={e.state === "pre" ? null : e.score[0]} live={e.state === "in"} />
        <Team name={f?.away ?? e.away} red={e.red[1]} />
        <Goals n={e.state === "pre" ? null : e.score[1]} live={e.state === "in"} />
      </div>
      {e.incidents.some((i) => i.kind !== "yellow") && (
        <p className="truncate px-4 pt-1.5 text-xs text-ink-3">
          {e.incidents.filter((i) => i.kind !== "yellow").map((i) => `${i.kind === "red" ? "🟥" : "⚽"} ${i.player ?? ""} ${i.minute}`).join("   ")}
        </p>
      )}
      {e.stats && <div className="px-4 pt-3"><StatBars s={{ home: { possession: e.stats.home.possession, shots: e.stats.home.shots, onTarget: e.stats.home.onTarget }, away: { possession: e.stats.away.possession, shots: e.stats.away.shots, onTarget: e.stats.away.onTarget } }} /></div>}
      {tip && f && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line bg-surface-2/50 px-4 py-2.5 text-sm">
          <span className="min-w-0 truncate"><span className="text-ink-3">Pick · </span><span className="font-medium">{marketName(tip.key, f.home, f.away)}</span></span>
          <span className="flex shrink-0 items-center gap-2">
            {e.state === "post" ? (
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
  return f ? <Link href={`/match/${f.id}#live`} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Team({ name, red }: { name: string; red: number }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 font-medium">
      <span className="truncate">{name}</span>
      {Array.from({ length: red }, (_, i) => <span key={i} className="inline-block h-3 w-2 shrink-0 rounded-xs bg-bad" aria-label="Red card" />)}
    </span>
  );
}

function Goals({ n, live }: { n: number | null; live: boolean }) {
  return <span className={cx("text-right font-display text-lg leading-6 font-semibold tabular", live && "text-bad")}>{n ?? ""}</span>;
}

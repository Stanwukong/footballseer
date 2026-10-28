"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { Odds } from "@/components/client";
import { LiveDot } from "@/components/live";
import { Segmented } from "@/components/TeamTables";
import { chip, cx, EdgeBadge, EmptyState, ProbPill, ResultMark } from "@/components/ui";
import { pct } from "@/lib/format";
import { useTennisFeed } from "@/lib/live-client";
import type { TennisMatch } from "@/lib/tennis/types";
import { EMPTY_PARAMS } from "@/lib/url";

type View = "in" | "pre" | "post";
type Circuit = "all" | "ATP" | "WTA" | "Challenger" | "ITF";

const CIRCUITS: Circuit[] = ["all", "ATP", "WTA", "Challenger", "ITF"];
/** The model's edge over the market worth flagging. */
const EDGE = 0.05;

function circuitOf(m: TennisMatch): Circuit | "Other" {
  const c = m.category;
  if (/challenger|125/i.test(c)) return "Challenger";
  if (/itf/i.test(c)) return "ITF";
  if (/wta/i.test(c)) return "WTA";
  if (/atp/i.test(c)) return "ATP";
  return "Other";
}

const TIER: Record<Circuit | "Other", number> = { all: 0, ATP: 0, WTA: 0, Challenger: 1, ITF: 2, Other: 3 };

/** Model chance minus market chance on the model's side, when both exist. */
function edgeOf(m: TennisMatch): { side: 0 | 1; edge: number } | null {
  if (!m.model || !m.market) return null;
  const side = m.model.p[0] >= m.model.p[1] ? 0 : 1;
  return { side, edge: m.model.p[side] - m.market[side] };
}

/** The search box in the header sends ?q=; the board reads it after hydration. */
export function TennisBoard(props: { initial: View }) {
  return (
    <Suspense fallback={<Board {...props} q="" />}>
      <BoardWithUrl {...props} />
    </Suspense>
  );
}

function BoardWithUrl(props: { initial: View }) {
  const sp = useSearchParams() ?? EMPTY_PARAMS;
  return <Board {...props} q={sp.get("q") ?? ""} />;
}

function Board({ initial, q }: { initial: View; q: string }) {
  const { feed, error } = useTennisFeed();
  const [chosen, setView] = useState<View | null>(null);
  const [circuit, setCircuit] = useState<Circuit>("all");
  const [doubles, setDoubles] = useState(false);
  const [sort, setSort] = useState<"time" | "edge">("time");

  const pool = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (feed?.matches ?? []).filter(
      (m) =>
        (doubles || !m.doubles) &&
        (circuit === "all" || circuitOf(m) === circuit) &&
        words.every((w) => `${m.players.join(" ")} ${m.tournament} ${m.category}`.toLowerCase().includes(w)),
    );
  }, [feed, q, circuit, doubles]);

  const counts = { in: 0, pre: 0, post: 0 };
  for (const m of pool) counts[m.state]++;
  const view = chosen ?? (counts[initial] ? initial : counts.in ? "in" : counts.pre ? "pre" : "post");
  const shown = useMemo(() => {
    const list = pool.filter((m) => m.state === view);
    if (view === "pre" && sort === "edge") list.sort((a, b) => (edgeOf(b)?.edge ?? -1) - (edgeOf(a)?.edge ?? -1));
    return list;
  }, [pool, view, sort]);

  // Group by tournament, tour events first, keeping the feed's order (or the edge order) inside each.
  const groups = useMemo(() => {
    if (sort === "edge" && view === "pre") return [{ key: "edge", title: null, items: shown }];
    const by = new Map<string, { key: string; title: string; tier: number; items: TennisMatch[] }>();
    for (const m of shown) {
      const key = `${m.category}|${m.tournament}`;
      if (!by.has(key)) by.set(key, { key, title: `${m.category} · ${m.tournament}`, tier: TIER[circuitOf(m)], items: [] });
      by.get(key)!.items.push(m);
    }
    return [...by.values()].sort((a, b) => a.tier - b.tier);
  }, [shown, sort, view]);

  if (!feed) {
    return error ? (
      <EmptyState title="Tennis data is unavailable">SportyBet didn&apos;t respond. The page retries every 30 seconds.</EmptyState>
    ) : (
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-surface-2" />)}
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
            { id: "pre", label: `Upcoming · ${counts.pre}` },
            { id: "post", label: `Finished · ${counts.post}` },
          ]}
        />
        <span className="font-mono text-[11px] text-ink-3 uppercase">
          {error ? "Reconnecting… " : ""}Updated {new Date(feed.updated).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · {feed.source}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          {CIRCUITS.map((c) => (
            <button key={c} type="button" className={chip(circuit === c)} aria-pressed={circuit === c} onClick={() => setCircuit(c)}>
              {c === "all" ? "All tours" : c}
            </button>
          ))}
          <button type="button" className={chip(doubles)} aria-pressed={doubles} onClick={() => setDoubles(!doubles)}>
            Doubles
          </button>
        </div>
        {view === "pre" && (
          <div className="ml-auto">
            <Segmented label="Sort" value={sort} onChange={setSort} options={[{ id: "time", label: "By start" }, { id: "edge", label: "Biggest edge" }]} />
          </div>
        )}
      </div>

      {q && <p className="text-sm text-ink-3">Matching &ldquo;{q}&rdquo;</p>}

      {shown.length === 0 ? (
        <EmptyState title={view === "in" ? "Nothing in play" : view === "pre" ? "Nothing coming up" : "No results yet today"}>
          {view === "in" && counts.pre > 0 ? "Matches appear here as they start." : null}
        </EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="space-y-2">
            {g.title && <h2 className="eyebrow truncate px-1 pt-2">{g.title}</h2>}
            <div className="grid gap-3 md:grid-cols-2">
              {g.items.map((m) => <TennisCard key={m.id} m={m} showEvent={!g.title} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function TennisCard({ m, showEvent }: { m: TennisMatch; showEvent: boolean }) {
  const e = edgeOf(m);
  const pick = m.model ? (m.model.p[0] >= m.model.p[1] ? 0 : 1) : null;
  const sets = Math.max(m.games.length, m.state === "pre" ? 0 : 1);
  return (
    <article className={cx("overflow-hidden rounded-xl border bg-surface shadow-card", m.state === "in" ? "border-bad/30" : "border-line")}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <span className="min-w-0 flex-1 truncate text-xs text-ink-3">
          {showEvent ? `${m.category} · ${m.tournament}` : m.bestOf === 5 ? "Best of five" : m.doubles ? "Doubles" : "Singles"}
        </span>
        {m.state === "in" ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-bad"><LiveDot />{m.status || "Live"}</span>
        ) : m.state === "pre" ? (
          <span className="font-mono text-[11px] text-ink-2 tabular">{startText(m.start)}</span>
        ) : (
          <span className="font-mono text-[11px] text-ink-2">{m.status}</span>
        )}
      </div>

      <div className="px-4 py-2.5">
        {[0, 1].map((k) => {
          const side = k as 0 | 1;
          const won = m.winner === side;
          return (
            <div key={k} className="flex h-8 items-center gap-2">
              <span className="flex w-2.5 shrink-0 justify-center">
                {m.serving === side && <span className="size-1.5 rounded-full bg-accent" aria-label="Serving" />}
              </span>
              <span className={cx("min-w-0 flex-1 truncate", m.winner != null && !won ? "text-ink-3" : "font-medium")}>
                {m.players[side]}
                {m.model && <span className="ml-1.5 font-mono text-[10px] text-ink-3 tabular">#{m.model.rank[side]}</span>}
              </span>
              {m.state !== "pre" && (
                <span className="flex shrink-0 items-center gap-1 font-mono text-sm tabular">
                  {Array.from({ length: sets }, (_, s) => {
                    const g = m.games[s];
                    const mine = g?.[side], theirs = g?.[1 - side];
                    const current = m.state === "in" && s === m.games.length - 1;
                    return (
                      <span key={s} className={cx("w-5 text-center", current ? "text-bad" : mine != null && theirs != null && mine > theirs ? "font-semibold" : "text-ink-3")}>
                        {mine ?? ""}
                      </span>
                    );
                  })}
                  {m.state === "in" && m.point && (
                    <span className="ml-1 w-7 rounded bg-surface-2 text-center text-xs leading-6 font-semibold">{m.point[side]}</span>
                  )}
                </span>
              )}
              {m.state === "pre" && m.odds && <Odds odds={m.odds[side]} className="w-12 shrink-0 text-right text-sm" />}
            </div>
          );
        })}
      </div>

      {(m.model || m.market) && !m.doubles && (
        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2/50 px-4 py-2.5 text-sm">
          {m.model && pick != null ? (
            <span className="min-w-0 truncate">
              <span className="text-ink-3">Model · </span>
              <span className="font-medium">{surname(m.players[pick])}</span>
            </span>
          ) : (
            <span className="text-ink-3">Market only · players not rated</span>
          )}
          <span className="flex shrink-0 items-center gap-2">
            {m.state === "post" && pick != null && m.winner != null ? (
              <><ProbPill p={m.model!.p[pick]} size="sm" /><ResultMark won={m.winner === pick} /></>
            ) : (
              <>
                {m.market && (
                  <span className="text-xs text-ink-3 tabular" title="SportyBet's fair chance, margin removed">
                    Market {pct(pick != null ? m.market[pick] : Math.max(...m.market))}
                  </span>
                )}
                {m.model && pick != null && <ProbPill p={m.model.p[pick]} size="sm" />}
                {e && e.edge >= EDGE && m.state === "pre" && <EdgeBadge edge={e.edge} />}
              </>
            )}
          </span>
        </div>
      )}
    </article>
  );
}

const surname = (name: string) => name.split(" ").at(-1) ?? name;

function startText(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === today.toDateString() ? time : `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${time}`;
}

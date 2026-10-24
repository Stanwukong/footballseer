import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { HeaderScore, MatchLive } from "@/components/basketball/live";
import { Ladders, MarginBands, MarketsGrid, WinBar } from "@/components/basketball/MarketsGrid";
import { PeriodMarkets } from "@/components/basketball/PeriodMarkets";
import { LastGames, StandingsTable, StatsCompare } from "@/components/basketball/TeamTables";
import { Odds, StarButton } from "@/components/client";
import { Card, CountryTag, cx, EdgeBadge, FormChips, PageSkeleton, ProbPill, Tag } from "@/components/ui";
import { getFixture, getFixtures, getLeagues, getTeams } from "@/lib/basketball/data";
import { marketName, PRICED, signed, streakText, topTip, trendText } from "@/lib/basketball/format";
import { faq, h2hSummary, previewParagraphs } from "@/lib/basketball/preview";
import type { TeamStats } from "@/lib/basketball/types";
import { fairOdds, ordinal, pct, signedPct } from "@/lib/format";

export async function generateStaticParams() {
  return (await getFixtures()).map((f) => ({ id: f.id }));
}

export async function generateMetadata({ params }: PageProps<"/basketball/match/[id]">): Promise<Metadata> {
  const f = await getFixture((await params).id);
  return { title: f ? `${f.away} at ${f.home} prediction` : "Game" };
}

const SECTIONS = [
  ["preview", "Preview"], ["markets", "Predictions"], ["periods", "Halves & quarters"], ["odds", "Odds"], ["table", "Standings"],
  ["form", "Last games"], ["stats", "Stats"], ["trends", "Trends"], ["h2h", "Head to head"], ["faq", "FAQ"],
] as const;

export default function GamePage({ params }: PageProps<"/basketball/match/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Game params={params} />
    </Suspense>
  );
}

const LINE_HINT = {
  book: "the bookmaker's",
  mixed: "the bookmaker's where published, otherwise the model's",
  model: "the model's spread and the league's average total",
};

async function Game({ params }: Pick<PageProps<"/basketball/match/[id]">, "params">) {
  const f = await getFixture((await params).id);
  if (!f) notFound();
  const [leagues, teams] = await Promise.all([getLeagues(), getTeams()]);
  const league = leagues.find((l) => l.code === f.league);
  const hs: TeamStats | undefined = teams[f.league]?.[f.home];
  const as: TeamStats | undefined = teams[f.league]?.[f.away];
  const table = league?.standings ?? [];
  const pos = (t: string) => table.findIndex((r) => r.team === t) + 1;
  const rec = (t: string) => table.find((r) => r.team === t)?.all;
  const rating = (t: string) => league?.teams.find((x) => x.team === t);
  const tip = topTip(f.p);
  const paragraphs = previewParagraphs(f, hs, as, table, league?.tz);
  const h2h = h2hSummary(f.h2h, f.home);
  const trends = [...(hs?.trends ?? []).map((t) => ({ ...t, team: f.home })), ...(as?.trends ?? []).map((t) => ({ ...t, team: f.away }))].sort((a, b) => b.n - a.n);
  const priced = f.odds ? Object.entries(f.odds).filter(([k, o]) => o != null && PRICED.has(k)) : [];
  const nick = (t: string) => t.split(" ").at(-1)!;
  const bookTotal = f.lines.src === "book" || f.lines.src === "mixed";

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-6" data-tour="match-head">
          {league && (
            <Link href={`/basketball/leagues/${league.code}`} className="flex min-w-0 items-center gap-2 text-sm hover:text-accent-text">
              <CountryTag country={league.country} />
              <span className="truncate">{league.country} · {league.name}{f.neutral ? " · neutral venue" : ""}</span>
            </Link>
          )}
          <StarButton id={f.id} label={`${f.away} at ${f.home}`} />
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-6 sm:px-6 sm:py-8">
          <TeamHead name={f.home} pos={pos(f.home)} rec={rec(f.home)} stats={hs} align="left" />
          <HeaderScore fixture={{ id: f.id, time: f.time, date: f.date }} tz={league?.tz} />
          <TeamHead name={f.away} pos={pos(f.away)} rec={rec(f.away)} stats={as} align="right" />
        </div>
        <div className="border-t border-line px-4 pt-4 pb-5 sm:px-6" data-tour="prob">
          <p className="eyebrow mb-2">Pre-game win probability</p>
          <WinBar p={f.p} home={f.home} away={f.away} size="lg" />
        </div>
      </section>

      <MatchLive fixture={f} periods={league?.periods ?? 4} />

      <nav aria-label="Sections" className="sticky top-14 z-20 -mx-4 border-b border-line bg-bg/90 px-4 backdrop-blur-md sm:mx-0 sm:rounded-xl sm:border sm:px-2">
        <ul className="scrollbar-none flex gap-1 overflow-x-auto py-2">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="block rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-ink-2 hover:bg-surface-2 hover:text-ink">{label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KeyFigure label="Pick" value={marketName(tip.key, f.lines, f.home, f.away)} sub={<ProbPill p={tip.p} size="sm" />} />
        <KeyFigure label="Expected score" value={`${f.pts[0].toFixed(0)} – ${f.pts[1].toFixed(0)}`} sub={`${Math.round(f.pts[0] + f.pts[1])} points in all`} />
        <KeyFigure label={f.lines.src === "model" ? "Model spread" : "Spread"} value={`${nick(f.home)} ${signed(f.lines.sp)}`} sub={`${pct(f.p.SP_H)} to cover`} />
        <KeyFigure label={bookTotal ? "Total" : "League-average total"} value={`${f.lines.to}`} sub={`${pct(f.p.TO_O)} over`} />
      </div>

      <Card id="preview" title="Game preview" hint="Written from the model and the league record, not by a tipster">
        <div className="max-w-3xl space-y-2.5 text-[15px] leading-relaxed text-ink-2">
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card id="markets" title="Predictions" hint={`Lines: ${LINE_HINT[f.lines.src ?? "model"]}. Right column: fair odds.`} className="lg:col-span-2">
          <MarketsGrid p={f.p} lines={f.lines} home={nick(f.home)} away={nick(f.away)} />
        </Card>
        <div className="min-w-0 space-y-4">
          <Card title="Winning margin">
            <MarginBands bands={f.bands} home={f.home} away={f.away} />
          </Card>
          <Card title="Alternative lines">
            <Ladders ladders={f.ladders} home={nick(f.home)} main={f.lines} />
          </Card>
        </div>
      </div>

      <Card id="periods" title="Halves & quarters" hint="Each period's share of the game's expected points, priced at lines scaled from the game's. Periods can end level.">
        <PeriodMarkets
          p={f.p}
          lines={f.lines}
          home={nick(f.home)}
          away={nick(f.away)}
          pts={f.pts}
          shares={Object.fromEntries(Object.entries(league?.per ?? {}).map(([k, v]) => [k, v[0]]))}
        />
      </Card>

      <Card id="odds" title="Odds vs model" hint="Bookmaker prices (via ESPN) against the model's fair price">
        {priced.length ? (
          <table className="w-full text-sm tabular">
            <thead className="text-[11px] tracking-wider text-ink-3 uppercase">
              <tr className="border-b border-line">
                <th className="py-2 text-left font-medium">Market</th>
                <th className="py-2 text-right font-medium">Model</th>
                <th className="py-2 text-right font-medium">Odds</th>
                <th className="py-2 text-right font-medium">Fair</th>
                <th className="py-2 text-right font-medium">Edge</th>
              </tr>
            </thead>
            <tbody>
              {priced.map(([k, o]) => {
                const edge = o ? f.p[k] * o - 1 : null;
                return (
                  <tr key={k} className="border-b border-line last:border-0">
                    <td className="py-2">{marketName(k, f.lines, f.home, f.away)}</td>
                    <td className="py-2 text-right">{pct(f.p[k])}</td>
                    <td className="py-2 text-right"><Odds odds={o} /></td>
                    <td className="py-2 text-right text-ink-2">{fairOdds(f.p[k])}</td>
                    <td className={cx("py-2 text-right", edge != null && edge > 0.05 ? "font-semibold text-accent-text" : "text-ink-3")}>{signedPct(edge)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-ink-3">
            No bookmaker prices for this game. ESPN publishes lines for the NBA, WNBA and major college games, usually a day or two before
            tip-off. Fair odds for every market are in Predictions.
          </p>
        )}
        {f.value.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-3">
            <span className="eyebrow self-center">Value flagged</span>
            {f.value.map((v) => (
              <span key={v.market} className="inline-flex items-center gap-2 text-sm">
                {marketName(v.market, f.lines, f.home, f.away)} @ <Odds odds={v.odds} /> <EdgeBadge edge={v.edge} />
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card id="table" title={league ? `${league.name} standings` : "Standings"} hint="Current season">
        <StandingsTable rows={table} highlight={[f.home, f.away]} />
      </Card>

      <Card id="form" title="Last games" hint="v = home, @ = away, N = neutral; HT is the half-time score">
        <LastGames home={f.home} away={f.away} hs={hs} as={as} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card id="stats" title="Pre-game stats" hint="How often each event happened for each team" className="lg:col-span-3">
          <StatsCompare home={f.home} away={f.away} hs={hs} as={as} />
        </Card>
        <Card title="Team ratings" hint="Model: points for and against a league-average side on a neutral floor" className="lg:col-span-2">
          <table className="w-full text-sm tabular">
            <thead className="text-[11px] tracking-wider text-ink-3 uppercase">
              <tr className="border-b border-line">
                <th className="py-2 text-left font-medium">Team</th>
                <th className="py-2 text-right font-medium">Rank</th>
                <th className="py-2 text-right font-medium">Off</th>
                <th className="py-2 text-right font-medium">Def</th>
                <th className="py-2 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {[f.home, f.away].map((t) => {
                const r = rating(t);
                return (
                  <tr key={t} className="border-b border-line last:border-0">
                    <td className="max-w-0 truncate py-2">{t}</td>
                    <td className="py-2 text-right">{r ? `#${(league?.teams.indexOf(r) ?? -1) + 1}` : "–"}</td>
                    <td className="py-2 text-right">{r?.pf.toFixed(1) ?? "–"}</td>
                    <td className="py-2 text-right">{r?.pa.toFixed(1) ?? "–"}</td>
                    <td className={cx("py-2 text-right font-semibold", r && (r.net >= 0 ? "text-good" : "text-bad"))}>{r ? signed(r.net) : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hs && as && (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
              {([[f.home, hs], [f.away, as]] as const).map(([t, s]) => (
                <div key={t} className="min-w-0">
                  <div className="eyebrow truncate">{t}, last 5</div>
                  <div className="mt-1 tabular"><span className="font-semibold">{s.avg5[0].toFixed(1)}</span> scored · <span className="font-semibold">{s.avg5[1].toFixed(1)}</span> allowed</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="trends" title="Trends" hint="Current runs of three games or more">
          {trends.length === 0 ? (
            <p className="text-sm text-ink-3">No notable runs for either team.</p>
          ) : (
            <ul className="divide-y divide-line">
              {trends.slice(0, 10).map((t, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft font-display font-semibold text-accent-text tabular">{t.n}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.team}</span>
                    <span className="block text-ink-2">{trendText(t)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card id="h2h" title="Head to head" hint="Recent meetings">
          {f.h2h.length === 0 ? (
            <p className="text-sm text-ink-3">These teams have not met in the last three seasons.</p>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2 text-center">
                <H2HStat label={`${f.home} wins`} value={h2h.hw} />
                <H2HStat label={`${f.away} wins`} value={h2h.aw} />
              </div>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {f.h2h.map(([d, h, a, hg, ag]) => (
                  <li key={d + h} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-16 shrink-0 font-mono text-[11px] text-ink-3">{d.slice(0, 4)} · {d.slice(5, 7)}</span>
                    <span className={cx("min-w-0 flex-1 truncate text-right", hg > ag && "font-semibold")}>{h}</span>
                    <span className="shrink-0 rounded bg-surface-2 px-2 py-0.5 font-mono font-semibold tabular">{hg}-{ag}</span>
                    <span className={cx("min-w-0 flex-1 truncate", ag > hg && "font-semibold")}>{a}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-3 tabular">{h2h.avg.toFixed(0)} points per meeting</p>
            </>
          )}
        </Card>
      </div>

      <Card id="faq" title="Frequently asked">
        <dl className="divide-y divide-line">
          {faq(f).map((x) => (
            <div key={x.q} className="py-3 first:pt-0">
              <dt className="font-medium">{x.q}</dt>
              <dd className="mt-1 text-sm text-ink-2 tabular">{x.a}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

function TeamHead({ name, pos, rec, stats, align }: { name: string; pos: number; rec?: number[]; stats?: TeamStats; align: "left" | "right" }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-2", align === "right" ? "items-end text-right" : "items-start")}>
      <h1 className="font-display text-lg leading-tight font-semibold tracking-tight wrap-break-word sm:text-2xl">{name}</h1>
      {stats?.form && <FormChips form={stats.form} />}
      <div className={cx("flex flex-wrap gap-1", align === "right" && "justify-end")}>
        {rec && rec[0] > 0 && <Tag>{rec[1]}–{rec[2]}{pos > 0 ? ` · ${ordinal(pos)}` : ""}</Tag>}
        {stats?.streak && <Tag tone={stats.streak.startsWith("W") ? "good" : "bad"}>{streakText(stats.streak)}</Tag>}
      </div>
    </div>
  );
}

function KeyFigure({ label, value, sub }: { label: string; value: ReactNode; sub: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-3.5 shadow-card sm:p-4">
      <div className="eyebrow truncate">{label}</div>
      <div className="mt-1.5 truncate font-display text-base font-semibold sm:text-lg">{value}</div>
      <div className="mt-1 text-xs text-ink-3">{sub}</div>
    </div>
  );
}

function H2HStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-2.5">
      <div className="font-display text-xl font-semibold tabular">{value}</div>
      <div className="truncate text-[11px] text-ink-3">{label}</div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { Odds, StarButton } from "@/components/client";
import { HeaderScore, MatchLive } from "@/components/live";
import { MarketsGrid } from "@/components/MarketsGrid";
import { ProbBar } from "@/components/ProbBar";
import { ScoreHeatmap } from "@/components/ScoreHeatmap";
import { LastMatches, StandingsTable, StatsCompare } from "@/components/TeamTables";
import { Card, CountryTag, cx, EdgeBadge, FormChips, PageSkeleton, ProbPill, Tag } from "@/components/ui";
import { getFixture, getFixtures, getLeagues, getTeams } from "@/lib/data";
import { fairOdds, marketName, ordinal, pct, signedPct, topTip, trendText } from "@/lib/format";
import { faq, h2hSummary, previewParagraphs } from "@/lib/preview";
import type { TeamStats } from "@/lib/types";

export async function generateStaticParams() {
  return (await getFixtures()).map((f) => ({ id: f.id }));
}

export async function generateMetadata({ params }: PageProps<"/match/[id]">): Promise<Metadata> {
  const f = await getFixture((await params).id);
  return { title: f ? `${f.home} v ${f.away} prediction` : "Match" };
}

const SECTIONS = [
  ["preview", "Preview"],
  ["markets", "Predictions"],
  ["odds", "Odds"],
  ["table", "Table"],
  ["form", "Last matches"],
  ["stats", "Stats"],
  ["trends", "Trends"],
  ["h2h", "Head to head"],
  ["faq", "FAQ"],
] as const;

export default function MatchPage({ params }: PageProps<"/match/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Match params={params} />
    </Suspense>
  );
}

async function Match({ params }: Pick<PageProps<"/match/[id]">, "params">) {
  const f = await getFixture((await params).id);
  if (!f) notFound();
  const [leagues, teams] = await Promise.all([getLeagues(), getTeams()]);
  const league = leagues.find((l) => l.code === f.league);
  const hs: TeamStats | undefined = teams[f.league]?.[f.home];
  const as: TeamStats | undefined = teams[f.league]?.[f.away];
  const table = league?.standings ?? [];
  const pos = (t: string) => table.findIndex((r) => r.team === t) + 1;
  const rating = (t: string) => league?.teams.find((x) => x.team === t);
  const tip = topTip(f.p);
  const paragraphs = previewParagraphs(f, hs, as, table);
  const h2h = h2hSummary(f.h2h, f.home);
  const trends = [
    ...(hs?.trends ?? []).map((t) => ({ ...t, team: f.home })),
    ...(as?.trends ?? []).map((t) => ({ ...t, team: f.away })),
  ].sort((a, b) => b.n - a.n);

  return (
    <div className="space-y-4">
      {/* Match header */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-6">
          {league && (
            <Link href={`/leagues/${league.code}`} className="flex min-w-0 items-center gap-2 text-sm hover:text-accent-text">
              <CountryTag country={league.country} />
              <span className="truncate">{league.country} · {league.name}</span>
            </Link>
          )}
          <StarButton id={f.id} label={`${f.home} v ${f.away}`} />
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-6 sm:px-6 sm:py-8">
          <TeamHead name={f.home} pos={pos(f.home)} stats={hs} align="left" />
          <HeaderScore fixture={{ id: f.id, time: f.time, date: f.date }} />
          <TeamHead name={f.away} pos={pos(f.away)} stats={as} align="right" />
        </div>
        <div className="border-t border-line px-4 pt-4 pb-5 sm:px-6">
          <p className="eyebrow mb-2">Pre-match probabilities</p>
          <ProbBar p={f.p} home={f.home} away={f.away} size="lg" />
        </div>
      </section>

      <MatchLive fixture={f} />

      {/* Section nav */}
      <nav aria-label="Sections" className="sticky top-14 z-20 -mx-4 border-b border-line bg-bg/90 px-4 backdrop-blur-md sm:mx-0 sm:rounded-xl sm:border sm:px-2">
        <ul className="scrollbar-none flex gap-1 overflow-x-auto py-2">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="block rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-ink-2 hover:bg-surface-2 hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KeyFigure label="Pick" value={marketName(tip.key, f.home, f.away)} sub={<ProbPill p={tip.p} size="sm" />} />
        <KeyFigure label="Expected goals" value={`${f.xg[0].toFixed(2)} – ${f.xg[1].toFixed(2)}`} sub={`${pct(f.p["O2.5"])} over 2.5`} />
        <KeyFigure label="Likeliest score" value={f.scores[0].score} sub={`${pct(f.scores[0].p, 1)} chance`} />
        <KeyFigure
          label={f.xc ? "Expected corners" : "Both teams score"}
          value={f.xc ? `${f.xc[0]} – ${f.xc[1]}` : pct(f.p.BTTS_Y)}
          sub={f.xc ? `${pct(f.p["C_O9.5"])} over 9.5` : `${pct(f.p.BTTS_N)} no`}
        />
      </div>

      <Card id="preview" title="Match preview" hint="Written from the model and the league record, not by a tipster">
        <div className="max-w-3xl space-y-2.5 text-[15px] leading-relaxed text-ink-2">
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card id="markets" title="Predictions" hint="Every market comes from the same scoreline probabilities. Right column: fair odds." className="lg:col-span-2">
          <MarketsGrid p={f.p} home={f.home} away={f.away} />
        </Card>
        <div className="min-w-0 space-y-4">
          <Card title="Correct score">
            <ScoreHeatmap matrix={f.matrix} home={f.home} away={f.away} />
          </Card>
          <Card title="Likeliest scores" flush>
            <ol className="divide-y divide-line border-t border-line">
              {f.scores.slice(0, 6).map((s, i) => (
                <li key={s.score} className="flex items-center gap-3 px-4 py-2 text-sm sm:px-5">
                  <span className="w-5 font-mono text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1 font-mono font-semibold">{s.score}</span>
                  <span className="tabular">{pct(s.p, 1)}</span>
                  <span className="w-12 text-right text-xs"><Odds p={s.p} /></span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <Card id="odds" title="Odds vs model" hint="Average bookmaker odds against the model's fair price">
        {f.odds ? (
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
              {Object.entries(f.odds).map(([k, o]) => {
                const edge = o ? f.p[k] * o - 1 : null;
                return (
                  <tr key={k} className="border-b border-line last:border-0">
                    <td className="py-2">{marketName(k, f.home, f.away)}</td>
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
          <p className="text-sm text-ink-3">No bookmaker odds published for this match yet; they usually appear a few days before kick-off. Fair odds for every market are in Predictions.</p>
        )}
        {f.value.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-3">
            <span className="eyebrow self-center">Value flagged</span>
            {f.value.map((v) => (
              <span key={v.market} className="inline-flex items-center gap-2 text-sm">
                {marketName(v.market, f.home, f.away)} @ <Odds odds={v.odds} /> <EdgeBadge edge={v.edge} />
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card id="table" title={league ? `${league.name} table` : "Table"} hint="Current season, league matches only">
        <StandingsTable rows={table} highlight={[f.home, f.away]} />
      </Card>

      <Card id="form" title="Last matches" hint="League matches; H/A is venue, HT the half-time score">
        <LastMatches home={f.home} away={f.away} hs={hs} as={as} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card id="stats" title="Pre-match stats" hint="How often each event happened for each team" className="lg:col-span-3">
          <StatsCompare home={f.home} away={f.away} hs={hs} as={as} />
        </Card>
        <Card title="Team strength" hint="Model ratings: expected goals for and against a league-average side" className="lg:col-span-2">
          <table className="w-full text-sm tabular">
            <thead className="text-[11px] tracking-wider text-ink-3 uppercase">
              <tr className="border-b border-line">
                <th className="py-2 text-left font-medium">Team</th>
                <th className="py-2 text-right font-medium">Rank</th>
                <th className="py-2 text-right font-medium">xGF</th>
                <th className="py-2 text-right font-medium">xGA</th>
              </tr>
            </thead>
            <tbody>
              {[f.home, f.away].map((t) => (
                <tr key={t} className="border-b border-line last:border-0">
                  <td className="py-2">{t}</td>
                  <td className="py-2 text-right">#{(league?.teams.findIndex((x) => x.team === t) ?? -1) + 1}</td>
                  <td className="py-2 text-right">{rating(t)?.xgf.toFixed(2)}</td>
                  <td className="py-2 text-right">{rating(t)?.xga.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hs && as && (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
              {[[f.home, hs], [f.away, as] as const].map(([t, s]) => (
                <div key={t as string} className="min-w-0">
                  <div className="eyebrow truncate">{t as string}, last 5</div>
                  <div className="mt-1 tabular">
                    <span className="font-semibold">{(s as TeamStats).avg5[0].toFixed(1)}</span> scored ·{" "}
                    <span className="font-semibold">{(s as TeamStats).avg5[1].toFixed(1)}</span> conceded
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="trends" title="Trends" hint="Current league runs of four matches or more">
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

        <Card id="h2h" title="Head to head" hint="Recent league meetings">
          {f.h2h.length === 0 ? (
            <p className="text-sm text-ink-3">These teams have not met in the league in the last three seasons.</p>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <H2HStat label={`${f.home} wins`} value={h2h.hw} />
                <H2HStat label="Draws" value={h2h.d} />
                <H2HStat label={`${f.away} wins`} value={h2h.aw} />
              </div>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {f.h2h.map(([d, h, a, hg, ag]) => (
                  <li key={d} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-16 shrink-0 font-mono text-[11px] text-ink-3">{d.slice(0, 4)} · {d.slice(5, 7)}</span>
                    <span className={cx("min-w-0 flex-1 truncate text-right", hg > ag && "font-semibold")}>{h}</span>
                    <span className="shrink-0 rounded bg-surface-2 px-2 py-0.5 font-mono font-semibold tabular">{hg}-{ag}</span>
                    <span className={cx("min-w-0 flex-1 truncate", ag > hg && "font-semibold")}>{a}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-3 tabular">{h2h.avg.toFixed(1)} goals per meeting</p>
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

function TeamHead({ name, pos, stats, align }: { name: string; pos: number; stats?: TeamStats; align: "left" | "right" }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-2", align === "right" ? "items-end text-right" : "items-start")}>
      <h1 className="font-display text-lg leading-tight font-semibold tracking-tight wrap-break-word sm:text-2xl">{name}</h1>
      {stats?.form && <FormChips form={stats.form} />}
      {pos > 0 && <Tag>{ordinal(pos)} in table</Tag>}
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

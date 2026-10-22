import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProbBar } from "@/components/ProbBar";
import { ScoreHeatmap } from "@/components/ScoreHeatmap";
import { Card, CardTitle, EdgeBadge, Meter } from "@/components/ui";
import { getFixture, getFixtures, getLeagues } from "@/lib/data";
import { fairOdds, formatDay, MARKET_GROUPS, marketName, pct, signedPct } from "@/lib/format";

export async function generateStaticParams() {
  return (await getFixtures()).map((f) => ({ id: f.id }));
}

export async function generateMetadata({ params }: PageProps<"/match/[id]">): Promise<Metadata> {
  const f = await getFixture((await params).id);
  return { title: f ? `${f.home} v ${f.away} prediction` : "Match" };
}

export default async function MatchPage({ params }: PageProps<"/match/[id]">) {
  const f = await getFixture((await params).id);
  if (!f) notFound();
  const league = (await getLeagues()).find((l) => l.code === f.league);
  const rank = (team: string) => (league ? league.teams.findIndex((t) => t.team === team) + 1 : 0);
  const team = (name: string) => league?.teams.find((t) => t.team === name);

  return (
    <div className="space-y-4">
      <div className="text-xs text-ink-3">
        <Link href={`/leagues/${f.league}`} className="hover:text-ink">{league?.country} · {league?.name}</Link>
        {" · "}{formatDay(f.date)}{f.time ? ` · ${f.time}` : ""}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{f.home} <span className="text-ink-3">v</span> {f.away}</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle hint="Model probability of each result">Match result</CardTitle>
          <ProbBar p={f.p} home={f.home} away={f.away} size="lg" />
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><div className="text-xs text-ink-3">Expected goals</div><div className="font-semibold tabular">{f.xg[0].toFixed(2)} – {f.xg[1].toFixed(2)}</div></div>
            <div><div className="text-xs text-ink-3">Most likely score</div><div className="font-semibold tabular">{f.scores[0].score} ({pct(f.scores[0].p)})</div></div>
            <div><div className="text-xs text-ink-3">Power rank</div><div className="font-semibold tabular">#{rank(f.home)} v #{rank(f.away)}</div></div>
            <div><div className="text-xs text-ink-3">Over 2.5 / BTTS</div><div className="font-semibold tabular">{pct(f.p["O2.5"])} / {pct(f.p["BTTS_Y"])}</div></div>
          </div>
        </Card>

        <Card>
          <CardTitle hint="Average bookmaker odds vs the model's fair price">Odds vs model</CardTitle>
          {f.odds ? (
            <table className="w-full text-sm tabular">
              <thead className="text-xs text-ink-3">
                <tr><th className="text-left font-normal">Market</th><th className="text-right font-normal">Odds</th><th className="text-right font-normal">Fair</th><th className="text-right font-normal">Edge</th></tr>
              </thead>
              <tbody>
                {Object.entries(f.odds).map(([k, o]) => {
                  const edge = o ? f.p[k] * o - 1 : null;
                  return (
                    <tr key={k} className="border-t border-line">
                      <td className="py-1.5">{marketName(k, f.home, f.away)}</td>
                      <td className="text-right">{o?.toFixed(2) ?? "–"}</td>
                      <td className="text-right text-ink-2">{fairOdds(f.p[k])}</td>
                      <td className={`text-right ${edge != null && edge > 0.05 ? "font-medium text-accent" : "text-ink-3"}`}>{signedPct(edge)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-ink-3">No bookmaker odds published for this match yet. Fair odds for every market are in the table below.</p>
          )}
          {f.value.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-line pt-3">
              <div className="text-xs font-medium text-ink-2">Value flagged</div>
              {f.value.map((v) => (
                <div key={v.market} className="flex items-center justify-between text-sm">
                  <span>{marketName(v.market, f.home, f.away)} @ {v.odds.toFixed(2)}</span>
                  <EdgeBadge edge={v.edge} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle hint="Every market is derived from the same scoreline probabilities">All markets</CardTitle>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {MARKET_GROUPS.map((g) => (
              <div key={g.title}>
                <div className="mb-1.5 text-xs font-medium text-ink-3">{g.title}</div>
                <table className="w-full text-sm tabular">
                  <tbody>
                    {g.keys.map((k) => (
                      <tr key={k}>
                        <td className="py-1 pr-2">{marketName(k, f.home, f.away)}</td>
                        <td className="w-24 py-1"><Meter value={f.p[k]} /></td>
                        <td className="w-12 py-1 text-right font-medium">{pct(f.p[k])}</td>
                        <td className="w-12 py-1 text-right text-xs text-ink-3">{fairOdds(f.p[k])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardTitle>Correct score</CardTitle>
            <ScoreHeatmap matrix={f.matrix} home={f.home} away={f.away} />
          </Card>
          <Card>
            <CardTitle hint="Expected goals for and against a league-average side">Team strength</CardTitle>
            <table className="w-full text-sm tabular">
              <thead className="text-xs text-ink-3">
                <tr><th className="text-left font-normal">Team</th><th className="text-right font-normal">Rank</th><th className="text-right font-normal">xGF</th><th className="text-right font-normal">xGA</th></tr>
              </thead>
              <tbody>
                {[f.home, f.away].map((t) => (
                  <tr key={t} className="border-t border-line">
                    <td className="py-1.5">{t}</td>
                    <td className="text-right">#{rank(t)}</td>
                    <td className="text-right">{team(t)?.xgf.toFixed(2)}</td>
                    <td className="text-right">{team(t)?.xga.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}

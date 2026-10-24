import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { StandingsTable } from "@/components/basketball/TeamTables";
import { StarButton } from "@/components/client";
import { Card, CountryTag, cx, PageHeader, PageSkeleton, ProbPill, Stat } from "@/components/ui";
import { getFixtures, getLeagues, getMeta, getTeams } from "@/lib/basketball/data";
import { pickText, signed, topTip } from "@/lib/basketball/format";
import { formatDay, pct } from "@/lib/format";

export async function generateStaticParams() {
  return (await getLeagues()).map((l) => ({ code: l.code }));
}

export async function generateMetadata({ params }: PageProps<"/basketball/leagues/[code]">): Promise<Metadata> {
  const { code } = await params;
  const l = (await getLeagues()).find((x) => x.code === code);
  return { title: l ? `${l.name} predictions` : code };
}

export default function LeaguePage({ params }: PageProps<"/basketball/leagues/[code]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <League params={params} />
    </Suspense>
  );
}

const PROFILE_ROWS: [string, string][] = [
  ["1", "Home wins"], ["CLOSE", "Decided by 5 or fewer"], ["BIG", "Decided by 10+"], ["BLOW", "Decided by 20+"],
  ["OT", "Went to overtime"], ["Q1_1", "Home side won the 1st quarter"], ["H1_1", "Home side won the 1st half"],
  ["H2_1", "Home side won the 2nd half"], ["CB", "Half-time leader lost"],
];

async function League({ params }: Pick<PageProps<"/basketball/leagues/[code]">, "params">) {
  const { code } = await params;
  const [leagues, fixtures, meta, teams] = await Promise.all([getLeagues(), getFixtures(), getMeta(), getTeams()]);
  const l = leagues.find((x) => x.code === code);
  if (!l) notFound();
  const upcoming = fixtures.filter((f) => f.league === code);
  const pr = l.profile;
  const teamStats = teams[code] ?? {};

  return (
    <>
      <PageHeader
        eyebrow={`${l.country}${l.tier > 1 ? " · Tier 2" : ""}`}
        title={<span className="inline-flex items-center gap-3"><CountryTag country={l.country} />{l.name}</span>}
        actions={<StarButton id={l.code} kind="leagues" label={l.name} />}
      >
        Model fitted on {l.games.toLocaleString()} games, the latest on {formatDay(l.last_game)}. Season {pr.season}: {pr.n} games played.
        Tip-off times in {l.tz}.
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Points per game" value={pr.total.toFixed(1)} sub={`${pr.home_pts.toFixed(1)} home · ${pr.away_pts.toFixed(1)} away`} />
        <Stat label="Home advantage" value={`${signed(Math.round(l.hfa * 10) / 10)} pts`} sub={`home sides win ${pct(pr.rates["1"])}`} />
        <Stat label="Average margin" value={pr.margin.toFixed(1)} sub={`model spread sd ${l.sigma_m.toFixed(1)}`} />
        <Stat label="Upcoming" value={upcoming.length} sub="next seven days" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="min-w-0 space-y-4 lg:col-span-3">
          <Card title="Standings" hint={`Season ${pr.season}, by win percentage`}>
            <StandingsTable rows={l.standings} />
          </Card>
          <Card title="Team profiles" hint="Share of each team's games this season" flush>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-120 text-sm tabular">
                <thead className="sticky top-0 bg-surface text-[11px] tracking-wider text-ink-3 uppercase">
                  <tr className="border-y border-line">
                    <th className="py-2 pl-4 text-left font-medium sm:pl-5">Team</th>
                    <th className="py-2 text-right font-medium" title="Won by 10 or more">W10+</th>
                    <th className="py-2 text-right font-medium" title="Decided by 5 or fewer">Close</th>
                    <th className="py-2 text-right font-medium" title="Total above the league average">Over avg</th>
                    <th className="py-2 text-right font-medium" title="Won the 1st quarter">Q1</th>
                    <th className="py-2 text-right font-medium" title="Led at half-time">Led HT</th>
                    <th className="py-2 pr-4 text-right font-medium sm:pr-5">Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {l.standings.slice(0, 120).map((s) => {
                    const r = teamStats[s.team]?.rates.all;
                    const cell = (k: string, n = r?.n) => (n && r?.c ? pct(r.c[k] / n) : "–");
                    return (
                      <tr key={s.team} className="border-b border-line last:border-0">
                        <td className="max-w-48 truncate py-2 pl-4 sm:pl-5">{s.team}</td>
                        <td className="py-2 text-right">{cell("W10")}</td>
                        <td className="py-2 text-right">{cell("CLOSE")}</td>
                        <td className="py-2 text-right">{cell("OVR")}</td>
                        <td className="py-2 text-right">{cell("Q1W", r?.nq)}</td>
                        <td className="py-2 text-right">{cell("H1W", r?.nh1)}</td>
                        <td className={cx("py-2 pr-4 text-right font-mono text-xs sm:pr-5", s.streak.startsWith("W") ? "text-good" : "text-bad")}>{s.streak}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card title="Upcoming games" flush>
            {upcoming.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-ink-3 sm:px-5">
                No games in the next seven days. The <Link className="text-accent-text underline" href="/basketball/predictor">matchup predictor</Link> prices any pairing.
              </p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {upcoming.slice(0, 40).map((f) => {
                  const tip = topTip(f.p);
                  const [market, pick] = pickText(tip.key, f.lines);
                  return (
                    <li key={f.id}>
                      <Link href={`/basketball/match/${f.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/70 sm:px-5">
                        <span className="w-14 shrink-0 font-mono text-[11px] text-ink-3">{formatDay(f.date, meta.as_of).replace("Tomorrow", "Tmrw")}<br />{f.time}</span>
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="block truncate font-medium">{f.home}</span>
                          <span className="block truncate font-medium">{f.away}</span>
                        </span>
                        <span className="text-right text-xs leading-tight">
                          <span className="block text-ink-3">{market}</span>
                          <span className="block font-semibold whitespace-nowrap">{pick}</span>
                        </span>
                        <ProbPill p={tip.p} size="sm" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="League profile" hint={`How games went, season ${pr.season}`}>
            <ul className="space-y-2.5">
              {PROFILE_ROWS.filter(([k]) => pr.rates[k] != null).map(([k, label]) => (
                <li key={k} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-ink-2">{label}</span>
                  <span className="font-semibold tabular">{pct(pr.rates[k])}</span>
                  <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${pr.rates[k] * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Power ratings" hint="Points for and against a league-average side on a neutral floor" flush>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-sm tabular">
                <thead className="sticky top-0 bg-surface text-[11px] tracking-wider text-ink-3 uppercase">
                  <tr className="border-y border-line">
                    <th className="w-8 py-2 pl-4 text-left font-medium sm:pl-5">#</th>
                    <th className="py-2 text-left font-medium">Team</th>
                    <th className="py-2 text-right font-medium">Off</th>
                    <th className="py-2 text-right font-medium">Def</th>
                    <th className="py-2 pr-4 text-right font-medium sm:pr-5">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {l.teams.slice(0, 120).map((t, i) => (
                    <tr key={t.team} className="border-b border-line last:border-0">
                      <td className="py-2 pl-4 text-ink-3 sm:pl-5">{i + 1}</td>
                      <td className="max-w-40 truncate py-2">{t.team}</td>
                      <td className="py-2 text-right">{t.pf.toFixed(1)}</td>
                      <td className="py-2 text-right">{t.pa.toFixed(1)}</td>
                      <td className={cx("py-2 pr-4 text-right font-semibold sm:pr-5", t.net >= 0 ? "text-good" : "text-bad")}>{signed(t.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { StarButton } from "@/components/client";
import { StandingsTable } from "@/components/TeamTables";
import { Card, CountryTag, PageHeader, PageSkeleton, ProbPill, Stat } from "@/components/ui";
import { getFixtures, getLeagues, getMeta, getTeams } from "@/lib/data";
import { formatDay, pct, pickText, season, topTip } from "@/lib/format";

export async function generateStaticParams() {
  return (await getLeagues()).map((l) => ({ code: l.code }));
}

export async function generateMetadata({ params }: PageProps<"/leagues/[code]">): Promise<Metadata> {
  const { code } = await params;
  const l = (await getLeagues()).find((x) => x.code === code);
  return { title: l ? `${l.country} ${l.name} predictions` : code };
}

export default function LeaguePage({ params }: PageProps<"/leagues/[code]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <League params={params} />
    </Suspense>
  );
}

const PROFILE_ROWS: [string, string][] = [
  ["O1.5", "Over 1.5 goals"], ["O2.5", "Over 2.5 goals"], ["O3.5", "Over 3.5 goals"], ["BTTS_Y", "Both teams score"],
  ["1", "Home wins"], ["X", "Draws"], ["2", "Away wins"], ["HT_O0.5", "Goal in 1st half"],
];

async function League({ params }: Pick<PageProps<"/leagues/[code]">, "params">) {
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
        eyebrow={`${l.country}${l.tier > 1 ? ` · Tier ${l.tier}` : ""}`}
        title={<span className="inline-flex items-center gap-3"><CountryTag country={l.country} />{l.name}</span>}
        actions={<StarButton id={l.code} kind="leagues" label={l.name} />}
      >
        Model fitted on {l.matches.toLocaleString()} matches, the latest on {formatDay(l.last_match)}. Season {season(pr?.season)}: {pr?.n} matches played.
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Goals per game" value={pr?.goals.toFixed(2) ?? "–"} sub={pr ? `${pr.home_goals.toFixed(2)} home · ${pr.away_goals.toFixed(2)} away` : undefined} />
        <Stat label="Over 2.5" value={pct(pr?.rates["O2.5"])} sub={`BTTS ${pct(pr?.rates.BTTS_Y)}`} />
        <Stat label="Home advantage" value={`+${((Math.exp(l.home_adv) - 1) * 100).toFixed(0)}%`} sub="extra goals at home" />
        <Stat label={pr?.corners ? "Corners per game" : "Upcoming"} value={pr?.corners ?? upcoming.length} sub={pr?.yellows ? `${pr.yellows} yellow cards` : "next few days"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="min-w-0 space-y-4 lg:col-span-3">
          <Card title="Standings" hint={`Season ${season(pr?.season)}, league matches only`}>
            <StandingsTable rows={l.standings} />
          </Card>
          <Card title="Team markets" hint="Share of each team's league matches this season" flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-120 text-sm tabular">
                <thead className="text-[11px] tracking-wider text-ink-3 uppercase">
                  <tr className="border-y border-line">
                    <th className="py-2 pl-4 text-left font-medium sm:pl-5">Team</th>
                    <th className="py-2 text-right font-medium">+1.5</th>
                    <th className="py-2 text-right font-medium">+2.5</th>
                    <th className="py-2 text-right font-medium">+3.5</th>
                    <th className="py-2 text-right font-medium">BTTS</th>
                    <th className="py-2 text-right font-medium">CS</th>
                    <th className="py-2 pr-4 text-right font-medium sm:pr-5">FTS</th>
                  </tr>
                </thead>
                <tbody>
                  {l.standings.map((s) => {
                    const r = teamStats[s.team]?.rates.all;
                    const cell = (k: string) => (r?.n && r.c ? pct(r.c[k] / r.n) : "–");
                    return (
                      <tr key={s.team} className="border-b border-line last:border-0">
                        <td className="py-2 pl-4 sm:pl-5">{s.team}</td>
                        <td className="py-2 text-right">{cell("O1.5")}</td>
                        <td className="py-2 text-right">{cell("O2.5")}</td>
                        <td className="py-2 text-right">{cell("O3.5")}</td>
                        <td className="py-2 text-right">{cell("BTTS_Y")}</td>
                        <td className="py-2 text-right">{cell("CS")}</td>
                        <td className="py-2 pr-4 text-right sm:pr-5">{cell("FTS")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card title="Upcoming matches" flush>
            {upcoming.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-ink-3 sm:px-5">
                No fixtures in the next few days. The <Link className="text-accent-text underline" href="/predictor">matchup predictor</Link> prices any pairing.
              </p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {upcoming.map((f) => {
                  const tip = topTip(f.p);
                  const [market, pick] = pickText(tip.key);
                  return (
                    <li key={f.id}>
                      <Link href={`/match/${f.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/70 sm:px-5">
                        <span className="w-14 shrink-0 font-mono text-[11px] text-ink-3">
                          {formatDay(f.date, meta.as_of).replace("Tomorrow", "Tmrw")}<br />{f.time}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="block truncate font-medium">{f.home}</span>
                          <span className="block truncate font-medium">{f.away}</span>
                        </span>
                        <span className="text-right text-xs leading-tight">
                          <span className="block text-ink-3">{market}</span>
                          <span className="block font-semibold">{pick}</span>
                        </span>
                        <ProbPill p={tip.p} size="sm" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {pr && (
            <Card title="League profile" hint={`How often each market landed, season ${season(pr.season)}`}>
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
          )}

          <Card title="Power ratings" hint="Goal difference expected against a league-average side" flush>
            <table className="w-full text-sm tabular">
              <thead className="text-[11px] tracking-wider text-ink-3 uppercase">
                <tr className="border-y border-line">
                  <th className="w-8 py-2 pl-4 text-left font-medium sm:pl-5">#</th>
                  <th className="py-2 text-left font-medium">Team</th>
                  <th className="py-2 text-right font-medium">xGF</th>
                  <th className="py-2 text-right font-medium">xGA</th>
                  <th className="py-2 pr-4 text-right font-medium sm:pr-5">Net</th>
                </tr>
              </thead>
              <tbody>
                {l.teams.map((t, i) => {
                  const net = t.xgf - t.xga;
                  return (
                    <tr key={t.team} className="border-b border-line last:border-0">
                      <td className="py-2 pl-4 text-ink-3 sm:pl-5">{i + 1}</td>
                      <td className="py-2">{t.team}</td>
                      <td className="py-2 text-right">{t.xgf.toFixed(2)}</td>
                      <td className="py-2 text-right">{t.xga.toFixed(2)}</td>
                      <td className={`py-2 pr-4 text-right font-semibold sm:pr-5 ${net >= 0 ? "text-good" : "text-bad"}`}>
                        {net >= 0 ? "+" : "−"}{Math.abs(net).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </>
  );
}

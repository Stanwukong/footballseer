import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProbBar } from "@/components/ProbBar";
import { Card, CardTitle, PageHeader, Stat } from "@/components/ui";
import { getFixtures, getLeagues, getMeta } from "@/lib/data";
import { formatDay, pct } from "@/lib/format";

export async function generateStaticParams() {
  return (await getLeagues()).map((l) => ({ code: l.code }));
}

export async function generateMetadata({ params }: PageProps<"/leagues/[code]">): Promise<Metadata> {
  const { code } = await params;
  const l = (await getLeagues()).find((x) => x.code === code);
  return { title: l ? `${l.country} ${l.name} predictions` : code };
}

export default async function LeaguePage({ params }: PageProps<"/leagues/[code]">) {
  const { code } = await params;
  const [leagues, fixtures, meta] = await Promise.all([getLeagues(), getFixtures(), getMeta()]);
  const l = leagues.find((x) => x.code === code);
  if (!l) notFound();
  const upcoming = fixtures.filter((f) => f.league === code);

  return (
    <>
      <PageHeader title={`${l.country} · ${l.name}`}>
        Model fitted on {l.matches.toLocaleString()} matches, latest {l.last_match}.
      </PageHeader>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Goals per game" value={l.avg_goals?.toFixed(2) ?? "–"} sub="last 12 months" />
        <Stat label="Home win rate" value={pct(l.home_win_rate)} />
        <Stat label="Home advantage" value={`+${((Math.exp(l.home_adv) - 1) * 100).toFixed(0)}%`} sub="extra goals at home" />
        <Stat label="Upcoming" value={upcoming.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardTitle hint="Ranked by goal difference expected against a league-average side">Power ratings</CardTitle>
          <table className="w-full text-sm tabular">
            <thead className="text-left text-xs text-ink-3">
              <tr>
                <th className="w-8 py-1 font-normal">#</th>
                <th className="py-1 font-normal">Team</th>
                <th className="py-1 text-right font-normal">xGF</th>
                <th className="py-1 text-right font-normal">xGA</th>
                <th className="py-1 text-right font-normal">Net</th>
              </tr>
            </thead>
            <tbody>
              {l.teams.map((t, i) => {
                const net = t.xgf - t.xga;
                return (
                  <tr key={t.team} className="border-t border-line">
                    <td className="py-1.5 text-ink-3">{i + 1}</td>
                    <td className="py-1.5">{t.team}</td>
                    <td className="py-1.5 text-right">{t.xgf.toFixed(2)}</td>
                    <td className="py-1.5 text-right">{t.xga.toFixed(2)}</td>
                    <td className={`py-1.5 text-right font-medium ${net >= 0 ? "text-good" : "text-bad"}`}>
                      {net >= 0 ? "+" : "−"}{Math.abs(net).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>Upcoming matches</CardTitle>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-3">No fixtures in the next 10 days. Use the <Link className="text-accent underline" href="/predictor">matchup predictor</Link> to price any pairing.</p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((f) => (
                <li key={f.id}>
                  <Link href={`/match/${f.id}`} className="block rounded-lg p-1 hover:bg-surface-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{f.home} v {f.away}</span>
                      <span className="text-xs text-ink-3">{formatDay(f.date, meta.as_of)}</span>
                    </div>
                    <div className="mt-1.5"><ProbBar p={f.p} home={f.home} away={f.away} /></div>
                    <div className="mt-1 flex justify-between text-xs text-ink-3 tabular">
                      <span>{pct(f.p["1"])}</span><span>{pct(f.p["X"])}</span><span>{pct(f.p["2"])}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

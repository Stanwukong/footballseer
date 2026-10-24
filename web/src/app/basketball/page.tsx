import type { Metadata } from "next";

import { MatchesBoard } from "@/components/basketball/MatchesBoard";
import { PageHeader } from "@/components/ui";
import { getLeagueIndex, getMeta, getResults, getSlimFixtures } from "@/lib/basketball/data";
import { formatDay } from "@/lib/format";

export const metadata: Metadata = { title: "Basketball predictions" };

export default async function BasketballHome() {
  const [fixtures, results, leagues, meta] = await Promise.all([getSlimFixtures(), getResults(), getLeagueIndex(), getMeta()]);
  const playing = new Set(fixtures.map((f) => f.league)).size;
  return (
    <>
      <PageHeader eyebrow={meta.as_of ? `Games · ${formatDay(meta.as_of)}` : "Games"} title="Basketball predictions">
        {fixtures.length} upcoming games across {playing} {playing === 1 ? "league" : "leagues"}, priced by a points model refitted every day:
        moneyline, spread, totals, team totals, winning margin and the first half. Tip-off times are local to each league.
      </PageHeader>
      <MatchesBoard fixtures={fixtures} results={results} leagues={leagues} today={meta.as_of} />
    </>
  );
}

import type { Metadata } from "next";

import { Generator } from "@/components/basketball/Picks";
import { PageHeader } from "@/components/ui";
import { getLeagueIndex, getMeta, getSlimFixtures } from "@/lib/basketball/data";

export const metadata: Metadata = { title: "Basketball bet generator" };

export default async function GeneratorPage() {
  const [fixtures, leagues, meta] = await Promise.all([getSlimFixtures(), getLeagueIndex(), getMeta()]);
  return (
    <>
      <PageHeader eyebrow="Tools" title="Bet generator">
        Set the markets, days, leagues, number of games and the odds and probability you want for each pick. The generator returns
        the likeliest accumulator that fits, one pick per game.
      </PageHeader>
      <Generator fixtures={fixtures} leagues={leagues} today={meta.as_of} />
    </>
  );
}

import type { Metadata } from "next";

import { MatchesBoard } from "@/components/MatchesBoard";
import { PageHeader } from "@/components/ui";
import { getLeagueIndex, getMeta, getSlimFixtures } from "@/lib/data";

export const metadata: Metadata = { title: "Favourites" };

export default async function FavouritesPage() {
  const [fixtures, leagues, meta] = await Promise.all([getSlimFixtures(), getLeagueIndex(), getMeta()]);
  return (
    <>
      <PageHeader eyebrow="Predictions" title="Favourites">
        Matches you have starred, plus every upcoming match in the leagues you follow.
      </PageHeader>
      <MatchesBoard fixtures={fixtures} results={[]} leagues={leagues} today={meta.as_of} favouritesOnly />
    </>
  );
}

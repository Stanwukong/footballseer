import type { Metadata } from "next";

import { MatchesBoard } from "@/components/basketball/MatchesBoard";
import { PageHeader } from "@/components/ui";
import { getLeagueIndex, getMeta, getSlimFixtures } from "@/lib/basketball/data";

export const metadata: Metadata = { title: "Basketball favourites" };

export default async function FavouritesPage() {
  const [fixtures, leagues, meta] = await Promise.all([getSlimFixtures(), getLeagueIndex(), getMeta()]);
  return (
    <>
      <PageHeader eyebrow="Predictions" title="Favourites">Games you have starred, plus every upcoming game in the leagues you follow.</PageHeader>
      <MatchesBoard fixtures={fixtures} results={[]} leagues={leagues} today={meta.as_of} favouritesOnly />
    </>
  );
}

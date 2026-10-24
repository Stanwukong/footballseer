import type { Metadata } from "next";

import { LiveBoard } from "@/components/basketball/live";
import { PageHeader } from "@/components/ui";
import { getLeagueIndex, getSlimFixtures } from "@/lib/basketball/data";

export const metadata: Metadata = { title: "Live basketball scores" };

export default async function LivePage() {
  const [fixtures, leagues] = await Promise.all([getSlimFixtures(), getLeagueIndex()]);
  const linked = fixtures.map(({ id, home, away, league, pts, sd, lines, p }) => ({ id, home, away, league, pts, sd, lines, p }));
  return (
    <>
      <PageHeader eyebrow="Predictions" title="Live scores">
        Today&apos;s games in the leagues we cover, refreshed every 30 seconds. For games we predicted, the pick&apos;s chance updates
        in play from the score and the clock; at the final buzzer it&apos;s marked won or lost.
      </PageHeader>
      <LiveBoard fixtures={linked} leagues={leagues} />
    </>
  );
}

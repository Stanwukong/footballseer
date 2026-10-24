import type { Metadata } from "next";

import { LiveBoard } from "@/components/LiveBoard";
import { PageHeader } from "@/components/ui";
import { getLeagueIndex, getSlimFixtures } from "@/lib/data";

export const metadata: Metadata = { title: "Live scores" };

export default async function LivePage() {
  const [fixtures, leagues] = await Promise.all([getSlimFixtures(), getLeagueIndex()]);
  const linked = fixtures.filter((f) => f.espn).map(({ id, home, away, xg, p }) => ({ id, home, away, xg, p }));
  return (
    <>
      <PageHeader eyebrow="Predictions" title="Live scores">
        Today&apos;s matches in the leagues we cover, refreshed every 30 seconds. For matches we predicted, the pick&apos;s chance
        updates in play from the score, the minute and red cards; at full time it&apos;s marked won or lost.
      </PageHeader>
      <LiveBoard fixtures={linked} leagues={leagues} />
    </>
  );
}

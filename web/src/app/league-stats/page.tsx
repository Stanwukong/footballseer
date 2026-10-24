import type { Metadata } from "next";

import { LeagueStatsBoard } from "@/components/LeagueStatsBoard";
import { PageHeader } from "@/components/ui";
import { getLeagues } from "@/lib/data";

export const metadata: Metadata = { title: "League stats" };

export default async function LeagueStatsPage() {
  const leagues = await getLeagues();
  const rows = leagues
    .filter((l) => l.profile)
    .map(({ code, country, name, tier, profile, fixtures }) => ({ code, country, name, tier, profile, fixtures }));
  return (
    <>
      <PageHeader eyebrow="Tools" title="League stats">
        Leagues ranked by how often each market lands this season: goal lines, both teams scoring, results, first-half goals,
        corners and cards.
      </PageHeader>
      <LeagueStatsBoard rows={rows} />
    </>
  );
}

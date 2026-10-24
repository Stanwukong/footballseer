import type { Metadata } from "next";

import { LeagueStatsBoard } from "@/components/basketball/Boards";
import { PageHeader } from "@/components/ui";
import { getLeagues } from "@/lib/basketball/data";

export const metadata: Metadata = { title: "Basketball league stats" };

export default async function LeagueStatsPage() {
  const leagues = await getLeagues();
  const rows = leagues.map(({ code, country, name, tier, tz, profile, fixtures }) => ({ code, country, name, tier, tz, profile, fixtures }));
  return (
    <>
      <PageHeader eyebrow="Tools" title="League stats">
        Leagues compared on how they play this season: scoring, home advantage, close games and blowouts, overtime and the first half.
      </PageHeader>
      <LeagueStatsBoard rows={rows} />
    </>
  );
}

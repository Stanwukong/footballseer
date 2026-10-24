import type { Metadata } from "next";

import { TrendsBoard, type TrendItem } from "@/components/TrendsBoard";
import { PageHeader } from "@/components/ui";
import { getLeagueIndex, getMeta, getSlimFixtures, getTeams } from "@/lib/basketball/data";

export const metadata: Metadata = { title: "Basketball trends" };

export default async function TrendsPage() {
  const [fixtures, teams, leagues, meta] = await Promise.all([getSlimFixtures(), getTeams(), getLeagueIndex(), getMeta()]);
  const items: TrendItem[] = [];
  for (const f of fixtures) {
    const fixture = { id: f.id, league: f.league, date: f.date, time: f.time, home: f.home, away: f.away };
    for (const side of ["home", "away"] as const) {
      const team = f[side];
      // A team's run at the other venue doesn't bear on this game.
      for (const t of teams[f.league]?.[team]?.trends ?? []) if (t.s === "all" || t.s === side) items.push({ ...t, team, side, fixture });
    }
  }
  return (
    <>
      <PageHeader eyebrow="Tools" title="Trends">
        Current runs for every team playing in the next few days: wins, big wins, scoring above or below the league&apos;s norm, half-time
        leads and more. A home team&apos;s run counts overall and at home; a road team&apos;s, overall and on the road.
      </PageHeader>
      <TrendsBoard items={items} leagues={leagues} today={meta.as_of} sport="basketball" />
    </>
  );
}

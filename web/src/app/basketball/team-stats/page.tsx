import type { Metadata } from "next";

import { TeamStatsBoard, type TeamRow } from "@/components/basketball/Boards";
import { PageHeader } from "@/components/ui";
import { getFixtures, getLeagueIndex, getMeta, getTeams } from "@/lib/basketball/data";

export const metadata: Metadata = { title: "Basketball team stats" };

export default async function TeamStatsPage() {
  const [fixtures, teams, leagues, meta] = await Promise.all([getFixtures(), getTeams(), getLeagueIndex(), getMeta()]);
  const next = new Map<string, TeamRow["next"]>();
  for (const f of fixtures) {
    for (const t of [f.home, f.away]) {
      const k = `${f.league}|${t}`;
      if (!next.has(k)) next.set(k, { id: f.id, date: f.date, time: f.time, home: f.home, away: f.away });
    }
  }
  const rows: TeamRow[] = Object.entries(teams).flatMap(([league, ts]) =>
    Object.entries(ts).map(([team, s]) => ({ team, league, rates: s.rates, next: next.get(`${league}|${team}`) })),
  );
  return (
    <>
      <PageHeader eyebrow="Tools" title="Team stats">
        For each event, the teams that hit it most often over their last 10 games, the season, or at home and on the road, with their
        next game.
      </PageHeader>
      <TeamStatsBoard rows={rows} leagues={leagues} today={meta.as_of} />
    </>
  );
}

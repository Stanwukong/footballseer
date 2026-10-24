import type { Metadata } from "next";

import { AdvancedFilters, type FilterRow } from "@/components/AdvancedFilters";
import { PageHeader } from "@/components/ui";
import { getFixtures, getLeagueIndex, getMeta, getTeams } from "@/lib/data";
import type { TeamStats } from "@/lib/types";

export const metadata: Metadata = { title: "Advanced filters" };

const side = (s: TeamStats | undefined, venue: "home" | "away") =>
  s ? { l10: s.rates.l10, venue: s.rates[venue], all: s.rates.all, avg5: s.avg5 } : undefined;

export default async function FiltersPage() {
  const [fixtures, teams, leagues, meta] = await Promise.all([getFixtures(), getTeams(), getLeagueIndex(), getMeta()]);
  const rows: FilterRow[] = fixtures.map(({ scores, matrix, h2h, ...f }) => {
    void scores;
    void matrix;
    return { f, h2h, home: side(teams[f.league]?.[f.home], "home"), away: side(teams[f.league]?.[f.away], "away") };
  });
  return (
    <>
      <PageHeader eyebrow="Tools" title="Advanced filters">
        Pick an event, then set how often each team&apos;s record must show it: last 10 matches, at the venue, across the season and
        in head-to-heads, plus recent scoring, odds and the model&apos;s probability. Matches that pass every filter are listed.
      </PageHeader>
      <AdvancedFilters rows={rows} leagues={leagues} today={meta.as_of} />
    </>
  );
}

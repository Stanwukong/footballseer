import type { Metadata } from "next";

import { AdvancedFilters, type FilterRow } from "@/components/basketball/AdvancedFilters";
import { PageHeader } from "@/components/ui";
import { getFixtures, getLeagueIndex, getLeagues, getMeta, getTeams } from "@/lib/basketball/data";
import type { TeamStats } from "@/lib/basketball/types";

export const metadata: Metadata = { title: "Basketball advanced filters" };

const side = (s: TeamStats | undefined, venue: "home" | "away") =>
  s ? { l10: s.rates.l10, venue: s.rates[venue], all: s.rates.all, avg5: s.avg5 } : undefined;

export default async function FiltersPage() {
  const [fixtures, teams, leagues, full, meta] = await Promise.all([getFixtures(), getTeams(), getLeagueIndex(), getLeagues(), getMeta()]);
  const avg = Object.fromEntries(full.map((l) => [l.code, l.profile.total]));
  const rows: FilterRow[] = fixtures.map(({ bands, ladders, h2h, ...f }) => {
    void bands;
    void ladders;
    return { f, h2h, avgTotal: avg[f.league] ?? 0, home: side(teams[f.league]?.[f.home], "home"), away: side(teams[f.league]?.[f.away], "away") };
  });
  return (
    <>
      <PageHeader eyebrow="Tools" title="Advanced filters">
        Pick an event, then set how often each team&apos;s record must show it: last 10 games, at the venue, across the season and in
        head-to-heads, plus recent scoring, odds and the model&apos;s probability. Games that pass every filter are listed.
      </PageHeader>
      <AdvancedFilters rows={rows} leagues={leagues} today={meta.as_of} />
    </>
  );
}

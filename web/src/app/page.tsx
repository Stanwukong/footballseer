import { MatchesBoard } from "@/components/MatchesBoard";
import { PageHeader } from "@/components/ui";
import { getLeagueIndex, getMeta, getResults, getSlimFixtures } from "@/lib/data";
import { formatDay } from "@/lib/format";

export default async function Home() {
  const [fixtures, results, leagues, meta] = await Promise.all([getSlimFixtures(), getResults(), getLeagueIndex(), getMeta()]);
  const playing = new Set(fixtures.map((f) => f.league)).size;
  return (
    <>
      <PageHeader eyebrow={meta.as_of ? `Matches · ${formatDay(meta.as_of)}` : "Matches"} title="Football predictions">
        {fixtures.length} upcoming matches across {playing} leagues, priced by a Dixon-Coles goals model refitted every day.
        Pick a day and a market; tap a match for the full breakdown.
      </PageHeader>
      <MatchesBoard fixtures={fixtures} results={results} leagues={leagues} today={meta.as_of} />
    </>
  );
}

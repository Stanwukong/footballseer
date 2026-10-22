import { Screener } from "@/components/Screener";
import { PageHeader, Stat } from "@/components/ui";
import { getLeagueIndex, getMeta, getSlimFixtures } from "@/lib/data";
import { formatDay } from "@/lib/format";

export default async function Home() {
  const [fixtures, leagues, meta] = await Promise.all([getSlimFixtures(), getLeagueIndex(), getMeta()]);
  const playing = new Set(fixtures.map((f) => f.league)).size;
  return (
    <>
      <PageHeader title="Predictions">
        Probabilities for {fixtures.length} upcoming matches from a Dixon-Coles goals model fitted daily on every league.
        Filter by market and confidence, or find matches where the bookmaker&apos;s price looks too generous.
      </PageHeader>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Upcoming matches" value={fixtures.length} />
        <Stat label="Leagues in play" value={playing} sub={`of ${meta.leagues} modelled`} />
        <Stat label="Value bets" value={meta.value_bets} sub="model edge over 5%" />
        <Stat label="Data as of" value={meta.as_of ? formatDay(meta.as_of) : "–"} />
      </div>
      <Screener fixtures={fixtures} leagues={leagues} today={meta.as_of} />
    </>
  );
}

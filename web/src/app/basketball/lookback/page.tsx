import type { Metadata } from "next";

import { MatchesBoard } from "@/components/basketball/MatchesBoard";
import { PageHeader } from "@/components/ui";
import { getLeagueIndex, getMeta, getResults } from "@/lib/basketball/data";

export const metadata: Metadata = { title: "Basketball lookback" };

export default async function LookbackPage() {
  const [results, leagues, meta] = await Promise.all([getResults(), getLeagueIndex(), getMeta()]);
  return (
    <>
      <PageHeader eyebrow="Predictions" title="Lookback">
        What the model predicted over the past seven days, and how each pick landed, settled at the line it was priced at.
        On days before live tracking began, the walk-forward backtest stands in.
      </PageHeader>
      <MatchesBoard fixtures={[]} results={results} leagues={leagues} today={meta.as_of} lookback />
    </>
  );
}

import type { Metadata } from "next";

import { MatchesBoard } from "@/components/MatchesBoard";
import { PageHeader } from "@/components/ui";
import { getLeagueIndex, getMeta, getResults } from "@/lib/data";

export const metadata: Metadata = { title: "Lookback" };

export default async function LookbackPage() {
  const [results, leagues, meta] = await Promise.all([getResults(), getLeagueIndex(), getMeta()]);
  return (
    <>
      <PageHeader eyebrow="Predictions" title="Lookback">
        What the model predicted over the past seven days, and how each pick landed. Probabilities are the ones published
        before kick-off; on days before live tracking began, the walk-forward backtest stands in.
      </PageHeader>
      <MatchesBoard fixtures={[]} results={results} leagues={leagues} today={meta.as_of} lookback />
    </>
  );
}

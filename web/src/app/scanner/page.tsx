import type { Metadata } from "next";

import { Scanner } from "@/components/Scanner";
import { PageHeader } from "@/components/ui";
import { getLeagueIndex, getMeta, getSlimFixtures, getTrackRecord } from "@/lib/data";

export const metadata: Metadata = { title: "Pre-match scanner" };

export default async function ScannerPage() {
  const [fixtures, leagues, meta, track] = await Promise.all([getSlimFixtures(), getLeagueIndex(), getMeta(), getTrackRecord()]);
  const bt = track.backtest;
  return (
    <>
      <PageHeader eyebrow="Tools" title="Pre-match scanner">
        Build a strategy from the model&apos;s probabilities, bookmaker odds and edge, backtest it on{" "}
        {bt ? `${bt.matches.toLocaleString()} walk-forward predictions (${bt.from} to ${bt.to})` : "the walk-forward predictions"},
        and see which upcoming matches it picks. ROI uses the average pre-match odds, flat one-unit stakes.
      </PageHeader>
      <Scanner fixtures={fixtures} leagues={leagues} today={meta.as_of} />
    </>
  );
}

import type { Metadata } from "next";

import { Scanner } from "@/components/basketball/Scanner";
import { PageHeader } from "@/components/ui";
import { getLeagueIndex, getMeta, getSlimFixtures, getTrackRecord } from "@/lib/basketball/data";

export const metadata: Metadata = { title: "Basketball pre-game scanner" };

export default async function ScannerPage() {
  const [fixtures, leagues, meta, track] = await Promise.all([getSlimFixtures(), getLeagueIndex(), getMeta(), getTrackRecord()]);
  const bt = track.backtest;
  return (
    <>
      <PageHeader eyebrow="Tools" title="Pre-game scanner">
        Build a strategy from the model&apos;s probabilities and expected score, backtest it on{" "}
        {bt ? `${bt.games.toLocaleString()} walk-forward predictions (${bt.from} to ${bt.to})` : "the walk-forward predictions"}, and see which
        upcoming games it picks. ESPN keeps no historical lines, so the backtest prices spreads at the model&apos;s own line and totals at
        the league&apos;s trailing average, and ROI needs live bookmaker prices.
      </PageHeader>
      <Scanner fixtures={fixtures} leagues={leagues} today={meta.as_of} />
    </>
  );
}

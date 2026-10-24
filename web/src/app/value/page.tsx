import type { Metadata } from "next";
import Link from "next/link";
import { Screener } from "@/components/Screener";
import { PageHeader } from "@/components/ui";
import { getLeagueIndex, getMeta, getSlimFixtures, getTrackRecord } from "@/lib/data";
import { signedPct } from "@/lib/format";

export const metadata: Metadata = { title: "Value bets" };

export default async function ValuePage() {
  const [fixtures, leagues, meta, track] = await Promise.all([getSlimFixtures(), getLeagueIndex(), getMeta(), getTrackRecord()]);
  const record = track.live ?? track.backtest;
  return (
    <>
      <PageHeader eyebrow="Predictions" title="Value bets">
        Matches where the model&apos;s probability times the average bookmaker odds is more than 5% above break-even.
        An edge here means the model and the market disagree, and the market is usually right.
      </PageHeader>
      {record && (
        <p className="mb-5 max-w-3xl rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm text-ink-2">
          <span className="font-medium text-ink">Read this first:</span> in the {track.live ? "live record" : "walk-forward backtest"},{" "}
          {record.value.bets.toLocaleString()} flagged bets returned{" "}
          <span className={record.value.roi != null && record.value.roi >= 0 ? "text-good" : "font-medium text-bad"}>{signedPct(record.value.roi)}</span>{" "}
          at flat stakes. Treat these as a shortlist to research, not tips.{" "}
          <Link href="/track-record" className="text-accent-text underline">Full track record</Link>
        </p>
      )}
      <Screener fixtures={fixtures} leagues={leagues} today={meta.as_of} defaults={{ value: "1", sort: "edge" }} />
    </>
  );
}

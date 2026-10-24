import type { Metadata } from "next";
import Link from "next/link";

import { Screener } from "@/components/basketball/Screener";
import { PageHeader } from "@/components/ui";
import { getLeagueIndex, getMeta, getSlimFixtures, getTrackRecord } from "@/lib/basketball/data";
import { signedPct } from "@/lib/format";

export const metadata: Metadata = { title: "Basketball value bets" };

export default async function ValuePage() {
  const [fixtures, leagues, meta, track] = await Promise.all([getSlimFixtures(), getLeagueIndex(), getMeta(), getTrackRecord()]);
  const v = track.live?.value;
  return (
    <>
      <PageHeader eyebrow="Predictions" title="Value bets">
        Games where the model&apos;s probability times the bookmaker&apos;s price is more than 5% above break-even, on the moneyline,
        spread or total. An edge means the model and the market disagree, and the market is usually right.
      </PageHeader>
      <p className="mb-5 max-w-3xl rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm text-ink-2">
        <span className="font-medium text-ink">Read this first:</span>{" "}
        {v && v.bets > 0 ? (
          <>
            in the live record, {v.bets.toLocaleString()} flagged bets returned{" "}
            <span className={v.roi != null && v.roi >= 0 ? "text-good" : "font-medium text-bad"}>{signedPct(v.roi)}</span> at flat stakes.{" "}
          </>
        ) : (
          <>ESPN keeps no historical odds, so these flags have no backtest; their record builds up from live predictions. </>
        )}
        Treat them as a shortlist to research, not tips. <Link href="/basketball/track-record" className="text-accent-text underline">Track record</Link>
      </p>
      <Screener fixtures={fixtures} leagues={leagues} today={meta.as_of} defaults={{ value: "1", sort: "edge" }} />
    </>
  );
}

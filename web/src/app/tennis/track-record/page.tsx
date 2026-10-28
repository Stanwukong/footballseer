import type { Metadata } from "next";

import { CalibrationChart } from "@/components/CalibrationChart";
import { Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { formatDay, pct } from "@/lib/format";
import { getBacktest, getRatings } from "@/lib/tennis/data";
import type { Scores } from "@/lib/tennis/types";

export const metadata: Metadata = { title: "Tennis track record" };

export default async function TennisTrackRecord() {
  const [bt, r] = await Promise.all([getBacktest(), getRatings()]);
  const o = bt.overall;
  return (
    <>
      <PageHeader eyebrow="Explore" title="Track record">
        A walk-forward test: every singles match of the last year, priced with only the results before it. Players need ten rated
        matches first. Retirements and walkovers aren&apos;t scored.
      </PageHeader>
      {!o ? (
        <EmptyState title="No backtest yet">It appears after the first daily run of the tennis model.</EmptyState>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Matches" value={o.n.toLocaleString("en-GB")} sub={bt.from && bt.to ? `${formatDay(bt.from)} – ${formatDay(bt.to)}` : undefined} />
            <Stat label="Favourite won" value={pct(o.accuracy, 1)} sub="The model's pick" />
            <Stat label="Log loss" value={o.logloss.toFixed(3)} sub="A coin flip scores 0.693" />
            <Stat label="Brier score" value={o.brier.toFixed(3)} sub="A coin flip scores 0.250" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Calibration" hint="When the model says 70%, the player should win about 70% of the time.">
              <CalibrationChart data={o.calibration} />
            </Card>
            <Card title="By tour" hint={`Elo gaps are scaled by ${r.scale.toFixed(2)}, fitted on the years before this test.`} flush>
              <table className="w-full text-sm tabular">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-3">
                    <th className="px-4 py-2 font-medium sm:px-5">Tour</th>
                    <th className="px-2 py-2 text-right font-medium">Matches</th>
                    <th className="px-2 py-2 text-right font-medium">Favourite won</th>
                    <th className="px-4 py-2 text-right font-medium sm:px-5">Log loss</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.entries(bt.tours) as [string, Scores][]).map(([tour, s]) => (
                    <tr key={tour} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 font-medium sm:px-5">{tour}</td>
                      <td className="px-2 py-2.5 text-right">{s.n.toLocaleString("en-GB")}</td>
                      <td className="px-2 py-2.5 text-right">{pct(s.accuracy, 1)}</td>
                      <td className="px-4 py-2.5 text-right sm:px-5">{s.logloss.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

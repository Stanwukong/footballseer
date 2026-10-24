import type { Metadata } from "next";
import Link from "next/link";

import { CalibrationPanel } from "@/components/CalibrationPanel";
import { Card, CardTitle, PageHeader, Stat } from "@/components/ui";
import { getLeagues, getTrackRecord } from "@/lib/data";
import { LABELS, pct, signedPct } from "@/lib/format";
import type { Summary } from "@/lib/types";

export const metadata: Metadata = { title: "Track record" };

function Section({ s, title, blurb, names }: { s: Summary; title: string; blurb: string; names: Record<string, string> }) {
  const x = s.one_x_two;
  const beatMarket = x.market_logloss != null && x.model_logloss_same != null && x.model_logloss_same < x.market_logloss;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-ink-2">{blurb} {s.matches.toLocaleString()} matches, {s.from} to {s.to}.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Result accuracy" value={pct(x.model_accuracy, 1)} sub={x.market_accuracy != null ? `bookmaker favourite: ${pct(x.market_accuracy, 1)}` : undefined} />
        <Stat
          label="Log loss, 1X2 (lower is better)"
          value={(x.model_logloss_same ?? x.model_logloss).toFixed(3)}
          sub={x.market_logloss != null ? `bookmakers: ${x.market_logloss.toFixed(3)}${beatMarket ? " · model ahead" : ""}` : undefined}
        />
        <Stat label="RPS (lower is better)" value={x.model_rps.toFixed(3)} sub={x.market_rps != null ? `bookmakers: ${x.market_rps.toFixed(3)}` : undefined} />
        <Stat
          label="Value bets, flat stake"
          value={<span className={s.value.roi != null && s.value.roi >= 0 ? "text-good" : "text-bad"}>{signedPct(s.value.roi)}</span>}
          sub={`${s.value.bets.toLocaleString()} bets · ${s.value.profit >= 0 ? "+" : ""}${s.value.profit.toFixed(1)} units`}
        />
      </div>

      <Card>
        <CardTitle hint="When the model says 70%, does it happen about 70% of the time? Points on the diagonal mean yes.">Calibration</CardTitle>
        <CalibrationPanel summary={s} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle hint={`Bets where model probability × average odds exceeded ${pct(1 + s.value.edge_threshold)} of stake`}>Value bets by market</CardTitle>
          <table className="w-full text-sm tabular">
            <thead className="text-left text-xs text-ink-3">
              <tr><th className="py-1 font-normal">Market</th><th className="py-1 text-right font-normal">Bets</th><th className="py-1 text-right font-normal">Hit rate</th><th className="py-1 text-right font-normal">ROI</th></tr>
            </thead>
            <tbody>
              {Object.entries(s.value.by_market).map(([k, v]) => (
                <tr key={k} className="border-t border-line">
                  <td className="py-1.5">{LABELS[k]}</td>
                  <td className="py-1.5 text-right">{v.bets.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{pct(v.hit_rate, 1)}</td>
                  <td className={`py-1.5 text-right font-medium ${v.roi != null && v.roi >= 0 ? "text-good" : "text-bad"}`}>{signedPct(v.roi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardTitle hint="Log loss on 1X2 for the same matches. Where the model is lower than the bookmakers, it was sharper.">By league</CardTitle>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm tabular">
              <thead className="sticky top-0 bg-surface text-left text-xs text-ink-3">
                <tr><th className="py-1 font-normal">League</th><th className="py-1 text-right font-normal">Matches</th><th className="py-1 text-right font-normal">Model</th><th className="py-1 text-right font-normal">Bookies</th></tr>
              </thead>
              <tbody>
                {s.leagues.map((l) => {
                  const ahead = l.market_logloss != null && l.model_logloss_same! < l.market_logloss;
                  return (
                    <tr key={l.league} className="border-t border-line">
                      <td className="py-1.5"><Link href={`/leagues/${l.league}`} className="hover:text-accent-text">{names[l.league] ?? l.league}</Link></td>
                      <td className="py-1.5 text-right">{l.n.toLocaleString()}</td>
                      <td className={`py-1.5 text-right ${ahead ? "font-medium text-good" : ""}`}>{(l.model_logloss_same ?? l.model_logloss).toFixed(3)}</td>
                      <td className="py-1.5 text-right text-ink-2">{l.market_logloss?.toFixed(3) ?? "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </section>
  );
}

export default async function TrackRecordPage() {
  const [tr, leagues] = await Promise.all([getTrackRecord(), getLeagues()]);
  const names = Object.fromEntries(leagues.map((l) => [l.code, `${l.country} · ${l.name}`]));
  return (
    <>
      <PageHeader eyebrow="Explore" title="Track record">
        Every prediction is logged before kick-off and settled automatically. Nothing is deleted or hand-picked.
        We compare against the bookmakers&apos; own implied probabilities, the hardest benchmark there is.
      </PageHeader>
      <div className="space-y-10">
        {tr.live ? (
          <Section s={tr.live} names={names} title="Live predictions" blurb="Published before kick-off." />
        ) : (
          <Card>
            <p className="text-sm text-ink-2">
              No live predictions have been settled yet. They appear here once matches predicted by the daily run are played.
            </p>
          </Card>
        )}
        {tr.backtest && (
          <Section s={tr.backtest} names={names} title="Walk-forward backtest"
            blurb="Each week the model was refitted using only results available at the time, then asked to predict the following week." />
        )}
      </div>
    </>
  );
}

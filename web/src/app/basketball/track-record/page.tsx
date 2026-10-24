import type { Metadata } from "next";
import Link from "next/link";

import { CalibrationPanel } from "@/components/CalibrationPanel";
import { Card, CardTitle, PageHeader, Stat } from "@/components/ui";
import { getLeagues, getTrackRecord } from "@/lib/basketball/data";
import { LABELS } from "@/lib/basketball/format";
import type { Summary } from "@/lib/basketball/types";
import { pct, signedPct } from "@/lib/format";

export const metadata: Metadata = { title: "Basketball track record" };

function Section({ s, title, blurb, names, live }: { s: Summary; title: string; blurb: string; names: Record<string, string>; live: boolean }) {
  const x = s.moneyline;
  const beat = x.market_logloss != null && x.model_logloss_same != null && x.model_logloss_same < x.market_logloss;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-ink-2">{blurb} {s.games.toLocaleString()} games, {s.from} to {s.to}.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Winner accuracy" value={pct(x.model_accuracy, 1)} sub={x.market_accuracy != null ? `bookmaker favourite: ${pct(x.market_accuracy, 1)}` : undefined} />
        <Stat
          label="Log loss, moneyline (lower is better)"
          value={(x.model_logloss_same ?? x.model_logloss).toFixed(3)}
          sub={x.market_logloss != null ? `bookmaker: ${x.market_logloss.toFixed(3)}${beat ? " · model ahead" : ""}` : "no bookmaker prices"}
        />
        <Stat
          label="Margin error, points"
          value={(x.model_margin_mae_same ?? x.margin_mae).toFixed(1)}
          sub={x.book_margin_mae != null ? `bookmaker spread: ${x.book_margin_mae.toFixed(1)}` : `total error ${x.total_mae.toFixed(1)}`}
        />
        {live ? (
          <Stat
            label="Value bets, flat stake"
            value={<span className={s.value.roi != null && s.value.roi >= 0 ? "text-good" : "text-bad"}>{signedPct(s.value.roi)}</span>}
            sub={`${s.value.bets.toLocaleString()} bets · ${s.value.profit >= 0 ? "+" : ""}${s.value.profit.toFixed(1)} units`}
          />
        ) : (
          <Stat label="Total error, points" value={x.total_mae.toFixed(1)} sub="mean absolute, expected vs final total" />
        )}
      </div>

      {(x.ats_hit != null || x.ou_hit != null) && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {x.ats_hit != null && <Stat label="Against the spread" value={pct(x.ats_hit, 1)} sub={`model's side, ${x.n_spread} games · 52.4% breaks even at -110`} />}
          {x.ou_hit != null && <Stat label="Over / under" value={pct(x.ou_hit, 1)} sub={`model's side, ${x.n_total} games`} />}
          {x.book_total_mae != null && <Stat label="Total error vs book" value={(x.model_total_mae_same ?? x.total_mae).toFixed(1)} sub={`bookmaker total: ${x.book_total_mae.toFixed(1)}`} />}
        </div>
      )}

      <Card>
        <CardTitle hint="When the model says 70%, does it happen about 70% of the time? Points on the diagonal mean yes.">Calibration</CardTitle>
        <CalibrationPanel summary={s} labels={LABELS} initial="1" />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {live && (
          <Card>
            <CardTitle hint={`Bets where model probability × bookmaker odds exceeded ${pct(1 + s.value.edge_threshold)} of stake`}>Value bets by market</CardTitle>
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
        )}
        <Card className={live ? "" : "lg:col-span-2"}>
          <CardTitle hint="Moneyline log loss and average margin error by league; bookmaker comparison where prices were recorded.">By league</CardTitle>
          <table className="w-full text-sm tabular">
            <thead className="text-left text-xs text-ink-3">
              <tr>
                <th className="py-1 font-normal">League</th>
                <th className="py-1 text-right font-normal">Games</th>
                <th className="py-1 text-right font-normal">Accuracy</th>
                <th className="py-1 text-right font-normal">Log loss</th>
                <th className="py-1 text-right font-normal">Bookmaker</th>
                <th className="py-1 text-right font-normal">Margin err.</th>
              </tr>
            </thead>
            <tbody>
              {s.leagues.map((l) => {
                const ahead = l.market_logloss != null && l.model_logloss_same! < l.market_logloss;
                return (
                  <tr key={l.league} className="border-t border-line">
                    <td className="py-1.5"><Link href={`/basketball/leagues/${l.league}`} className="hover:text-accent-text">{names[l.league] ?? l.league}</Link></td>
                    <td className="py-1.5 text-right">{l.n.toLocaleString()}</td>
                    <td className="py-1.5 text-right">{pct(l.accuracy, 1)}</td>
                    <td className={`py-1.5 text-right ${ahead ? "font-medium text-good" : ""}`}>{(l.model_logloss_same ?? l.model_logloss).toFixed(3)}</td>
                    <td className="py-1.5 text-right text-ink-2">{l.market_logloss?.toFixed(3) ?? "–"}</td>
                    <td className="py-1.5 text-right">{l.margin_mae.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
        Every prediction is logged before tip-off with the bookmaker&apos;s lines and prices, and settled automatically. Nothing is deleted
        or hand-picked. The backtest has no bookmaker comparison: ESPN keeps no historical odds.
      </PageHeader>
      <div className="space-y-10">
        {tr.live ? (
          <Section s={tr.live} names={names} live title="Live predictions" blurb="Published before tip-off." />
        ) : (
          <Card>
            <p className="text-sm text-ink-2">No live predictions have been settled yet. They appear here once games predicted by the daily run are played.</p>
          </Card>
        )}
        {tr.backtest && (
          <Section
            s={tr.backtest}
            names={names}
            live={false}
            title="Walk-forward backtest"
            blurb="Each week the model was refitted using only results available at the time, then asked to predict the following week. Spreads were priced at the model's own line and totals at the league's trailing average."
          />
        )}
      </div>
    </>
  );
}

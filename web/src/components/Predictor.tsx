"use client";

import { useMemo, useState } from "react";

import { ProbBar } from "@/components/ProbBar";
import { ScoreHeatmap } from "@/components/ScoreHeatmap";
import { Card, CardTitle, Meter } from "@/components/ui";
import { markets, rates, scoreMatrix, topScores } from "@/lib/dc";
import { fairOdds, MARKET_GROUPS, marketName, pct } from "@/lib/format";
import type { League } from "@/lib/types";

export function Predictor({ leagues }: { leagues: League[] }) {
  const [code, setCode] = useState(leagues[0]?.code ?? "");
  const league = leagues.find((l) => l.code === code)!;
  const [home, setHome] = useState(league?.teams[0]?.team ?? "");
  const [away, setAway] = useState(league?.teams[1]?.team ?? "");

  const pickLeague = (c: string) => {
    const l = leagues.find((x) => x.code === c)!;
    setCode(c);
    setHome(l.teams[0].team);
    setAway(l.teams[1].team);
  };

  const result = useMemo(() => {
    if (!league || !home || !away || home === away) return null;
    const [lh, la] = rates(league, home, away);
    const m = scoreMatrix(lh, la, league.rho);
    return { lh, la, m, p: markets(m), scores: topScores(m) };
  }, [league, home, away]);

  const select = "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm";
  const teams = league?.teams.map((t) => t.team).sort() ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-ink-3">League
            <select className={select} value={code} onChange={(e) => pickLeague(e.target.value)}>
              {leagues.map((l) => <option key={l.code} value={l.code}>{l.country} · {l.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-3">Home
            <select className={select} value={home} onChange={(e) => setHome(e.target.value)}>
              {teams.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-3">Away
            <select className={select} value={away} onChange={(e) => setAway(e.target.value)}>
              {teams.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
        </div>
      </Card>

      {!result ? (
        <p className="text-sm text-ink-3">Pick two different teams.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardTitle hint={`Expected goals ${result.lh.toFixed(2)} – ${result.la.toFixed(2)}`}>{home} v {away}</CardTitle>
            <ProbBar p={result.p} home={home} away={away} size="lg" />
            <div className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {MARKET_GROUPS.map((g) => (
                <div key={g.title}>
                  <div className="mb-1.5 text-xs font-medium text-ink-3">{g.title}</div>
                  <table className="w-full text-sm tabular">
                    <tbody>
                      {g.keys.map((k) => (
                        <tr key={k}>
                          <td className="py-1 pr-2">{marketName(k, home, away)}</td>
                          <td className="w-24 py-1"><Meter value={result.p[k]} /></td>
                          <td className="w-12 py-1 text-right font-medium">{pct(result.p[k])}</td>
                          <td className="w-12 py-1 text-right text-xs text-ink-3">{fairOdds(result.p[k])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardTitle>Correct score</CardTitle>
            <ScoreHeatmap matrix={result.m} home={home} away={away} />
          </Card>
        </div>
      )}
    </div>
  );
}

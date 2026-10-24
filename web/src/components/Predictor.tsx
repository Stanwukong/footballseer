"use client";

import { useMemo, useState } from "react";

import { ProbBar } from "@/components/ProbBar";
import { ScoreHeatmap } from "@/components/ScoreHeatmap";
import { MarketsGrid } from "@/components/MarketsGrid";
import { Card, CardTitle } from "@/components/ui";
import { markets, rates, scoreMatrix, topScores } from "@/lib/dc";
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

  const select = "mt-1.5 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-ink hover:border-line-strong";
  const teams = league?.teams.map((t) => t.team).sort() ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="eyebrow">League
            <select className={select} value={code} onChange={(e) => pickLeague(e.target.value)}>
              {leagues.map((l) => <option key={l.code} value={l.code}>{l.country} · {l.name}</option>)}
            </select>
          </label>
          <label className="eyebrow">Home
            <select className={select} value={home} onChange={(e) => setHome(e.target.value)}>
              {teams.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="eyebrow">Away
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
            <div className="mt-6">
              <MarketsGrid p={result.p} home={home} away={away} />
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

import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { getLeagues } from "@/lib/data";
import { pct } from "@/lib/format";

export const metadata: Metadata = { title: "Leagues" };

export default async function LeaguesPage() {
  const leagues = await getLeagues();
  const countries = new Set(leagues.map((l) => l.country));
  return (
    <>
      <PageHeader title="Leagues">
        {leagues.length} leagues across {countries.size} countries. Each one has its own model, refitted every day.
      </PageHeader>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-ink-3">
            <tr>
              <th className="px-3 py-2 font-normal">League</th>
              <th className="px-3 py-2 text-right font-normal">Goals / game</th>
              <th className="hidden px-3 py-2 text-right font-normal sm:table-cell">Home wins</th>
              <th className="hidden px-3 py-2 text-right font-normal sm:table-cell">Top rated</th>
              <th className="px-3 py-2 text-right font-normal">Upcoming</th>
              <th className="hidden px-3 py-2 text-right font-normal md:table-cell">Latest result</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {leagues.map((l) => (
              <tr key={l.code} className="border-b border-line last:border-0 hover:bg-surface-2">
                <td className="px-3 py-2">
                  <Link href={`/leagues/${l.code}`} className="font-medium hover:text-accent">{l.name}</Link>
                  <div className="text-xs text-ink-3">{l.country}{l.tier > 1 ? ` · tier ${l.tier}` : ""}</div>
                </td>
                <td className="px-3 py-2 text-right">{l.avg_goals?.toFixed(2) ?? "–"}</td>
                <td className="hidden px-3 py-2 text-right sm:table-cell">{pct(l.home_win_rate)}</td>
                <td className="hidden px-3 py-2 text-right sm:table-cell">{l.teams[0]?.team}</td>
                <td className="px-3 py-2 text-right">{l.fixtures || "–"}</td>
                <td className="hidden px-3 py-2 text-right text-ink-3 md:table-cell">{l.last_match}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

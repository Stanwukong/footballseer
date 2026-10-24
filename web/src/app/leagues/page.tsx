import type { Metadata } from "next";
import Link from "next/link";

import { CountryTag, PageHeader } from "@/components/ui";
import { getLeagues } from "@/lib/data";
import { pct } from "@/lib/format";

export const metadata: Metadata = { title: "Leagues" };

export default async function LeaguesPage() {
  const leagues = await getLeagues();
  const countries = new Map<string, typeof leagues>();
  for (const l of leagues) countries.set(l.country, [...(countries.get(l.country) ?? []), l]);
  return (
    <>
      <PageHeader eyebrow="Explore" title="Leagues">
        {leagues.length} leagues across {countries.size} countries. Each has its own model, refitted every day.
      </PageHeader>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[...countries.entries()].map(([country, ls]) => (
          <section key={country} className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <header className="flex items-center gap-2.5 border-b border-line bg-surface-2/60 px-4 py-2.5">
              <CountryTag country={country} />
              <h2 className="text-sm font-semibold">{country}</h2>
            </header>
            <ul className="divide-y divide-line">
              {ls.map((l) => (
                <li key={l.code}>
                  <Link href={`/leagues/${l.code}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/70">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{l.name}</div>
                      <div className="mt-0.5 text-xs text-ink-3 tabular">
                        Leader {l.standings[0]?.team ?? "–"} · {l.profile?.goals.toFixed(2) ?? l.avg_goals?.toFixed(2)} goals/game · {pct(l.profile?.rates["O2.5"])} over 2.5
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-ink-2 tabular">
                      {l.fixtures ? `${l.fixtures} upcoming` : "No fixtures"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

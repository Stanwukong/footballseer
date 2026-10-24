import type { Metadata } from "next";
import Link from "next/link";

import { CountryTag, PageHeader } from "@/components/ui";
import { getLeagues } from "@/lib/basketball/data";
import { winPct } from "@/lib/basketball/format";

export const metadata: Metadata = { title: "Basketball leagues" };

export default async function LeaguesPage() {
  const leagues = await getLeagues();
  const countries = new Map<string, typeof leagues>();
  for (const l of leagues) countries.set(l.country, [...(countries.get(l.country) ?? []), l]);
  return (
    <>
      <PageHeader eyebrow="Explore" title="Leagues">
        {leagues.length} leagues. Each has its own model, refitted every day from ESPN and EuroLeague data.
      </PageHeader>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[...countries.entries()].map(([country, ls]) => (
          <section key={country} className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <header className="flex items-center gap-2.5 border-b border-line bg-surface-2/60 px-4 py-2.5">
              <CountryTag country={country} />
              <h2 className="text-sm font-semibold">{country}</h2>
            </header>
            <ul className="divide-y divide-line">
              {ls.map((l) => {
                const top = l.standings[0];
                return (
                  <li key={l.code}>
                    <Link href={`/basketball/leagues/${l.code}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/70">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{l.name}</div>
                        <div className="mt-0.5 truncate text-xs text-ink-3 tabular">
                          {top ? `${top.team} ${top.all[1]}–${top.all[2]} (${winPct(top.all[1], top.all[0])})` : "–"} · {l.profile.total.toFixed(0)} pts/game
                        </div>
                      </div>
                      <span className="shrink-0 rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-ink-2 tabular">
                        {l.fixtures ? `${l.fixtures} upcoming` : "Off-season"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

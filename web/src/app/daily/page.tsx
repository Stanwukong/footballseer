import type { Metadata } from "next";

import { AccaCard } from "@/components/AccaCard";
import { DayName } from "@/components/client";
import { PageHeader } from "@/components/ui";
import { getLeagueIndex, getMeta, getSlimFixtures } from "@/lib/data";
import { dailyBets } from "@/lib/picks";

export const metadata: Metadata = { title: "Daily bets" };

export default async function DailyPage() {
  const [fixtures, leagues, meta] = await Promise.all([getSlimFixtures(), getLeagueIndex(), getMeta()]);
  const byCode = Object.fromEntries(leagues.map((l) => [l.code, l]));
  const days = [...new Set(fixtures.map((f) => f.date))].sort().slice(0, 3);
  return (
    <>
      <PageHeader eyebrow="Predictions" title="Daily bets">
        Two accumulators a day, picked by the model rather than a tipster: a <strong className="font-semibold text-ink">double</strong> built
        from short-priced picks, and a three-leg <strong className="font-semibold text-ink">risk</strong> at bigger odds. Legs come from
        different leagues. The combined chance treats matches as independent.
      </PageHeader>
      <div className="space-y-8">
        {days.map((d) => {
          const day = fixtures.filter((f) => f.date === d);
          const { double, risk } = dailyBets(day);
          return (
            <section key={d}>
              <h2 className="eyebrow mb-3 !text-ink-2"><DayName iso={d} asOf={meta.as_of} /> · {day.length} matches</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <AccaCard title="Double" subtitle="Two likely picks, single odds 1.25–1.60" acca={double} leagues={byCode} today={meta.as_of} />
                <AccaCard title="Risk" subtitle="Three picks, single odds 1.40–2.10" acca={risk} leagues={byCode} today={meta.as_of} />
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { CountryTag, EmptyState, PageHeader, ProbPill } from "@/components/ui";
import { getFixtures, getLeagues, getMeta, getTeams } from "@/lib/basketball/data";
import { marketName, topTip } from "@/lib/basketball/format";
import { previewParagraphs } from "@/lib/basketball/preview";
import { formatDay } from "@/lib/format";

export const metadata: Metadata = { title: "Basketball previews" };

export default async function PreviewsPage() {
  const [fixtures, leagues, teams, meta] = await Promise.all([getFixtures(), getLeagues(), getTeams(), getMeta()]);
  const byCode = Object.fromEntries(leagues.map((l) => [l.code, l]));
  const order = Object.fromEntries(leagues.map((l, i) => [l.code, l.tier * 100 + i]));
  // Top leagues first, then by tip-off: the games most readers want a preview of.
  const picks = [...fixtures]
    .filter((f) => byCode[f.league]?.tier === 1)
    .sort((a, b) => a.date.localeCompare(b.date) || order[a.league] - order[b.league] || a.time.localeCompare(b.time))
    .slice(0, 36);
  return (
    <>
      <PageHeader eyebrow="Predictions" title="Game previews">
        Previews for top-league games in the next few days, written from the model, the standings, recent form and head-to-heads.
      </PageHeader>
      {picks.length === 0 && <EmptyState title="No top-league games in the next few days" />}
      <div className="grid gap-4 md:grid-cols-2">
        {picks.map((f) => {
          const l = byCode[f.league];
          const tip = topTip(f.p);
          const [intro, model] = previewParagraphs(f, teams[f.league]?.[f.home], teams[f.league]?.[f.away], l?.standings ?? [], l?.tz);
          return (
            <article key={f.id} className="flex flex-col rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
              <div className="flex items-center gap-2 text-xs text-ink-3">
                <CountryTag country={l?.country ?? ""} />
                <span className="truncate">{l?.name}</span>
                <span className="ml-auto shrink-0 font-mono text-[11px]">{formatDay(f.date, meta.as_of)} {f.time} {l?.tz}</span>
              </div>
              <h2 className="mt-3 font-display text-lg leading-snug font-semibold tracking-tight">
                <Link href={`/basketball/match/${f.id}#preview`} className="hover:text-accent-text">{f.away} at {f.home}: prediction and preview</Link>
              </h2>
              <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-ink-2">{intro} {model}</p>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
                <span className="min-w-0 truncate text-sm"><span className="text-ink-3">Pick </span><span className="font-medium">{marketName(tip.key, f.lines, f.home, f.away)}</span></span>
                <ProbPill p={tip.p} size="sm" />
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

import Link from "next/link";

import { Odds } from "@/components/client";
import { CountryTag, ProbPill } from "@/components/ui";
import { formatDay, marketName, pct, pickText } from "@/lib/format";
import type { Acca } from "@/lib/picks";
import type { LeagueInfo } from "@/lib/types";

/** An accumulator as a ticket: one row per leg, total odds and combined chance at the foot. */
export function AccaCard({ title, subtitle, acca, leagues, today }: {
  title: string;
  subtitle?: string;
  acca: Acca;
  leagues: Record<string, LeagueInfo>;
  today?: string;
}) {
  const fair = acca.legs.some((l) => l.fair);
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div>
          <h2 className="font-display text-base font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-ink-3">{subtitle}</p>}
        </div>
        <span className="eyebrow">{acca.legs.length} {acca.legs.length === 1 ? "leg" : "legs"}</span>
      </header>
      {acca.legs.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-3 sm:px-5">No matches fit these criteria.</p>
      ) : (
        <ol className="divide-y divide-line">
          {acca.legs.map((c, i) => {
            const l = leagues[c.f.league];
            const [market, pick] = pickText(c.key);
            return (
              <li key={c.f.id}>
                <Link href={`/match/${c.f.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/70 sm:px-5">
                  <span className="hidden w-5 font-mono text-[11px] text-ink-3 sm:block">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] text-ink-3">
                      {l && <CountryTag country={l.country} />}
                      <span className="truncate">{l?.name} · {formatDay(c.f.date, today)} {c.f.time ?? ""}</span>
                    </div>
                    <div className="mt-1 truncate text-sm font-medium">{c.f.home} <span className="text-ink-3">v</span> {c.f.away}</div>
                    <div className="mt-0.5 truncate text-xs text-ink-2" title={marketName(c.key, c.f.home, c.f.away)}>
                      {market} <span className="font-semibold text-ink">{pick}</span>
                    </div>
                  </div>
                  <ProbPill p={c.p} size="sm" />
                  <span className="w-12 text-right text-sm"><Odds odds={c.fair ? null : c.odds} p={c.p} /></span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      {acca.legs.length > 0 && (
        <footer className="flex items-center justify-between gap-3 border-t border-line bg-surface-2/60 px-4 py-3 sm:px-5">
          <span className="text-xs text-ink-3">
            All legs win: <span className="font-semibold text-ink tabular">{pct(acca.p, 1)}</span>
          </span>
          <span className="text-sm">
            <span className="mr-2 text-xs text-ink-3">{fair ? "Fair odds" : "Total odds"}</span>
            <span className="font-display text-lg font-semibold"><Odds odds={acca.odds} /></span>
          </span>
        </footer>
      )}
    </section>
  );
}

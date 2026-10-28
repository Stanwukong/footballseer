"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Segmented } from "@/components/TeamTables";
import { cx, EmptyState, input } from "@/components/ui";
import { pct, shortDate } from "@/lib/format";
import type { RatedPlayer, Tour, WL } from "@/lib/tennis/types";

const PAGE = 100;

/** `year` is each player's record over the last 12 months, by id. */
export function RatingsTable({ players, year }: { players: RatedPlayer[]; year: Record<string, WL> }) {
  const [tour, setTour] = useState<Tour>("ATP");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const rows = useMemo(() => {
    const w = q.trim().toLowerCase();
    return players.filter((p) => p.tour === tour && (!w || p.name.toLowerCase().includes(w)));
  }, [players, tour, q]);

  if (!players.length) return <EmptyState title="No ratings yet">They appear after the first daily run of the tennis model.</EmptyState>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Tour" value={tour} onChange={(t) => { setTour(t); setShown(PAGE); }} options={[{ id: "ATP", label: "ATP · men" }, { id: "WTA", label: "WTA · women" }]} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a player" aria-label="Find a player" className={cx(input, "w-full sm:w-60")} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
        <table className="w-full text-sm tabular">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th className="w-12 px-4 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Player</th>
              <th className="px-2 py-2 text-right font-medium">Elo</th>
              <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Matches</th>
              <th className="hidden px-2 py-2 text-right font-medium md:table-cell">Last 12 months</th>
              <th className="px-2 py-2 font-medium">Form</th>
              <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Last played</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                <td className="px-4 py-2 text-ink-3">{p.rank}</td>
                <td className="max-w-48 truncate px-2 py-2 font-medium">
                  <Link href={`/tennis/players/${p.id}`} className="hover:text-accent-text hover:underline">{p.name}</Link>
                  {p.country && <span className="ml-1.5 font-mono text-[10px] text-ink-3">{p.country}</span>}
                </td>
                <td className="px-2 py-2 text-right font-semibold">{Math.round(p.elo)}</td>
                <td className="hidden px-2 py-2 text-right text-ink-2 sm:table-cell">{p.n}</td>
                <td className="hidden px-2 py-2 text-right md:table-cell">
                  {year[p.id] ? (
                    <>
                      <span className="font-medium">{year[p.id][0]}–{year[p.id][1]}</span>
                      <span className="ml-1.5 text-xs text-ink-3">{pct(year[p.id][0] / Math.max(1, year[p.id][0] + year[p.id][1]))}</span>
                    </>
                  ) : "–"}
                </td>
                <td className="px-2 py-2">
                  {/* Newest result on the right, as elsewhere on the site. */}
                  <span className="inline-flex gap-0.5">
                    {[...p.form].reverse().map((r, i) => (
                      <span key={i} className={cx("inline-flex size-4 items-center justify-center rounded-[3px] text-[9px] font-bold", r === "W" ? "bg-good text-accent-ink" : "bg-bad text-white")}>{r}</span>
                    ))}
                  </span>
                </td>
                <td className="hidden px-4 py-2 text-right text-ink-3 sm:table-cell">{shortDate(p.last)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown && (
        <button type="button" onClick={() => setShown(shown + PAGE)} className="w-full rounded-lg border border-line bg-surface py-2 text-sm text-ink-2 hover:border-line-strong">
          Show more · {rows.length - shown} left
        </button>
      )}
    </div>
  );
}

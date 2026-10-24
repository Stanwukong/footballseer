import { Odds } from "@/components/client";
import { Meter } from "@/components/ui";
import { MARKET_GROUPS, marketName, pct, prob } from "@/lib/format";
import type { Probs } from "@/lib/types";

/** Every priced market in groups: probability meter, percentage and fair odds. */
export function MarketsGrid({ p, home, away }: { p: Probs; home: string; away: string }) {
  return (
    <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
      {MARKET_GROUPS.map((g) => {
        const keys = g.keys.filter((k) => prob(p, k) != null);
        if (!keys.length) return null;
        return (
          <div key={g.title} className="min-w-0">
            <div className="eyebrow mb-2">{g.title}</div>
            <table className="w-full text-sm tabular">
              <tbody>
                {keys.map((k) => {
                  const v = prob(p, k)!;
                  return (
                    <tr key={k} className="border-b border-line/70 last:border-0">
                      <td className="max-w-0 truncate py-1.5 pr-3">{marketName(k, home, away)}</td>
                      <td className="w-20 py-1.5 sm:w-24"><Meter value={v} /></td>
                      <td className="w-12 py-1.5 text-right font-semibold">{pct(v)}</td>
                      <td className="w-14 py-1.5 text-right text-xs"><Odds p={v} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

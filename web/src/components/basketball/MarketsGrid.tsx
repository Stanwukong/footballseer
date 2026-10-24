import { Odds } from "@/components/client";
import { cx, Meter } from "@/components/ui";
import { marketName, MARKET_GROUPS, signed } from "@/lib/basketball/format";
import type { Lines, Probs } from "@/lib/basketball/types";
import { pct } from "@/lib/format";

/** Every priced market in groups: probability meter, percentage and fair odds. */
export function MarketsGrid({ p, lines, home, away }: { p: Probs; lines: Lines; home: string; away: string }) {
  return (
    <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
      {MARKET_GROUPS.map((g) => {
        const keys = g.keys.filter((k) => p[k] != null);
        if (!keys.length) return null;
        return (
          <div key={g.title} className="min-w-0">
            <div className="eyebrow mb-2">{g.title}</div>
            <table className="w-full text-sm tabular">
              <tbody>
                {keys.map((k) => (
                  <tr key={k} className="border-b border-line/70 last:border-0">
                    <td className="max-w-0 truncate py-1.5 pr-3">{marketName(k, lines, home, away)}</td>
                    <td className="w-20 py-1.5 sm:w-24"><Meter value={p[k]} /></td>
                    <td className="w-12 py-1.5 text-right font-semibold">{pct(p[k])}</td>
                    <td className="w-14 py-1.5 text-right text-xs"><Odds p={p[k]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/** Winning-margin bands as a diverging bar list: home wins on top, away wins below. */
export function MarginBands({ bands, home, away }: { bands: { band: string; p: number }[]; home: string; away: string }) {
  const max = Math.max(...bands.map((b) => b.p), 0.01);
  return (
    <ul className="space-y-1.5">
      {bands.map((b) => {
        const isHome = b.band.startsWith("Home");
        return (
          <li key={b.band} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-2 text-sm">
            <span className="truncate text-ink-2">{b.band.replace(/^Home/, home.split(" ").at(-1)!).replace(/^Away/, away.split(" ").at(-1)!)}</span>
            <span className="h-2 overflow-hidden rounded-full bg-surface-2">
              <span className={cx("block h-full rounded-full", isHome ? "bg-home" : "bg-away")} style={{ width: `${(b.p / max) * 100}%` }} />
            </span>
            <span className="text-right font-semibold tabular">{pct(b.p, 1)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Alternative spreads and totals around the main lines. */
export function Ladders({ ladders, home, main }: { ladders: { spread: [number, number][]; total: [number, number][] }; home: string; main: Lines }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="min-w-0">
        <div className="eyebrow mb-2">{home} spread</div>
        <table className="w-full text-sm tabular">
          <tbody>
            {ladders.spread.map(([l, p]) => (
              <tr key={l} className={cx("border-b border-line/70 last:border-0", l === main.sp && "font-semibold")}>
                <td className="py-1">{signed(l)}</td>
                <td className="py-1 text-right">{pct(p)}</td>
                <td className="w-14 py-1 text-right text-xs"><Odds p={p} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="min-w-0">
        <div className="eyebrow mb-2">Over total</div>
        <table className="w-full text-sm tabular">
          <tbody>
            {ladders.total.map(([l, p]) => (
              <tr key={l} className={cx("border-b border-line/70 last:border-0", l === main.to && "font-semibold")}>
                <td className="py-1">O {l}</td>
                <td className="py-1 text-right">{pct(p)}</td>
                <td className="w-14 py-1 text-right text-xs"><Odds p={p} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Home / away split as one bar. */
export function WinBar({ p, home, away, size = "sm" }: { p: Probs; home: string; away: string; size?: "sm" | "lg" }) {
  const h = p["1"], a = p["2"];
  return (
    <div className="w-full">
      <div className={cx("flex w-full gap-[2px] overflow-hidden rounded", size === "lg" ? "h-3" : "h-1.5")} role="img" aria-label={`${home} ${pct(h)}, ${away} ${pct(a)}`}>
        <div className="h-full bg-home" style={{ width: `${h * 100}%` }} />
        <div className="h-full bg-away" style={{ width: `${a * 100}%` }} />
      </div>
      {size === "lg" && (
        <div className="mt-2 grid grid-cols-2 text-sm">
          {[[home, h, "bg-home"], [away, a, "bg-away"]].map(([t, v, c], i) => (
            <div key={i} className={i ? "text-right" : ""}>
              <div className="text-2xl font-semibold tabular">{pct(v as number)}</div>
              <div className={cx("flex items-center gap-1.5 text-ink-2", i > 0 && "justify-end")}>
                <span className={cx("inline-block size-2 rounded-full", c as string)} aria-hidden />
                <span className="truncate">{t as string} win</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

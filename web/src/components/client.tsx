"use client";

import { Monitor, Moon, Star, Sun } from "lucide-react";

import { cx } from "@/components/ui";
import { formatDay, formatOdds, type OddsFormat } from "@/lib/format";
import { useFavourites, useOddsFormat, useTheme, type Theme } from "@/lib/prefs";
import { useToday } from "@/lib/today";

/**
 * Odds in the reader's chosen format. Without a bookmaker price, shows the
 * model's fair price, muted, so the two are never confused.
 */
export function Odds({ odds, p, className = "" }: { odds?: number | null; p?: number | null; className?: string }) {
  const [f] = useOddsFormat();
  if (odds) return <span className={cx("font-medium tabular", className)}>{formatOdds(odds, f)}</span>;
  if (p) {
    return (
      <span className={cx("tabular text-ink-3", className)} title="Fair odds implied by the model. No bookmaker price yet.">
        {formatOdds(1 / p, f)}
      </span>
    );
  }
  return <span className="text-ink-3">–</span>;
}

export function StarButton({ id, kind = "matches", label }: { id: string; kind?: "matches" | "leagues"; label: string }) {
  const fav = useFavourites(kind);
  const on = fav.has(id);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fav.toggle(id);
      }}
      aria-pressed={on}
      aria-label={on ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
      className={cx("inline-flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-2", on ? "text-warn" : "text-ink-3 hover:text-ink")}
    >
      <Star size={16} fill={on ? "currentColor" : "none"} strokeWidth={1.75} />
    </button>
  );
}

const THEMES: { id: Theme; icon: typeof Sun; label: string }[] = [
  { id: "light", icon: Sun, label: "Light" },
  { id: "system", icon: Monitor, label: "System" },
  { id: "dark", icon: Moon, label: "Dark" },
];

export function ThemeSwitch({ withLabels = false }: { withLabels?: boolean }) {
  const [theme, setTheme] = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          aria-label={t.label}
          title={t.label}
          onClick={() => setTheme(t.id)}
          className={cx(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
            theme === t.id ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink",
          )}
        >
          <t.icon size={14} strokeWidth={1.75} />
          {withLabels && t.label}
        </button>
      ))}
    </div>
  );
}

const FORMATS: { id: OddsFormat; label: string }[] = [
  { id: "decimal", label: "1.50" },
  { id: "fractional", label: "1/2" },
  { id: "american", label: "-200" },
];

export function OddsSwitch() {
  const [f, setF] = useOddsFormat();
  return (
    <div role="radiogroup" aria-label="Odds format" className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {FORMATS.map((x) => (
        <button
          key={x.id}
          type="button"
          role="radio"
          aria-checked={f === x.id}
          title={x.id[0].toUpperCase() + x.id.slice(1)}
          onClick={() => setF(x.id)}
          className={cx(
            "inline-flex h-7 items-center rounded-md px-2 font-mono text-[11px] font-medium transition-colors",
            f === x.id ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink",
          )}
        >
          {x.label}
        </button>
      ))}
    </div>
  );
}

/**
 * "Today", "Tomorrow", "Yesterday" or the date, against the viewer's today
 * rather than the pipeline's as_of. Without `iso`, today's own date.
 */
export function DayName({ iso, asOf, short = false }: { iso?: string; asOf: string; short?: boolean }) {
  const today = useToday(asOf);
  const s = iso ? formatDay(iso, today) : formatDay(today);
  return short ? s.replace("Tomorrow", "Tmrw") : s;
}

import Link from "next/link";
import type { ReactNode } from "react";

import { countryCode, heat, pct } from "@/lib/format";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({
  children,
  className = "",
  title,
  hint,
  action,
  flush = false,
  id,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  /** No inner padding, for tables and lists that run edge to edge. */
  flush?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cx("min-w-0 scroll-mt-24 rounded-xl border border-line bg-surface shadow-card", className)}>
      {title && (
        <header className={cx("flex items-start justify-between gap-3 px-4 pt-4 sm:px-5", flush ? "pb-3" : "pb-1")}>
          <div className="min-w-0">
            <h2 className="font-display text-[15px] font-semibold tracking-tight">{title}</h2>
            {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={flush ? "" : "p-4 pt-3 sm:px-5 sm:pb-5"}>{children}</div>
    </section>
  );
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-[15px] font-semibold tracking-tight">{children}</h2>
      {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

/** Editorial page header: mono eyebrow, display-face title, a short standfirst and actions. */
export function PageHeader({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line pb-5">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {children && <div className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A labelled block within a page, closed by a hairline. */
export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div id={id} className="mb-3 flex scroll-mt-24 items-center justify-between gap-3 border-b border-line pb-2">
      <h2 className="eyebrow !text-ink-2">{children}</h2>
      {action}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="eyebrow truncate">{label}</div>
      <div className="mt-2 truncate font-display text-xl font-semibold tabular sm:text-2xl">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

/** Thin single-value meter for a probability. */
export function Meter({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)} aria-hidden>
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

/** A probability on the accent heat scale. */
export function ProbPill({ p, size = "md" }: { p: number | null | undefined; size?: "sm" | "md" }) {
  return (
    <span
      className={cx(
        `heat-${heat(p)} inline-flex items-center justify-center rounded-md font-semibold tabular`,
        size === "sm" ? "min-w-10 px-1.5 py-0.5 text-xs" : "min-w-12 px-2 py-1 text-[13px]",
      )}
    >
      {pct(p)}
    </span>
  );
}

const FORM_CLS: Record<string, string> = {
  W: "bg-good text-accent-ink",
  D: "bg-surface-3 text-ink-2",
  L: "bg-bad text-white",
};

/** Recent results, oldest to newest, newest on the right. */
export function FormChips({ form, size = "md" }: { form: string; size?: "sm" | "md" }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Form, oldest to newest: ${form.split("").join(" ")}`}>
      {form.split("").map((r, i) => (
        <span
          key={i}
          className={cx(
            "inline-flex items-center justify-center rounded font-mono font-semibold",
            size === "sm" ? "size-4 text-[9px]" : "size-5 text-[10px]",
            FORM_CLS[r],
          )}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

export function CountryTag({ country }: { country: string }) {
  return (
    <span className="inline-flex h-5 min-w-9 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[10px] font-semibold tracking-wider text-ink-2">
      {countryCode(country)}
    </span>
  );
}

export function LeagueLink({ code, country, name, className = "" }: { code: string; country: string; name: string; className?: string }) {
  return (
    <Link href={`/leagues/${code}`} className={cx("inline-flex min-w-0 items-center gap-2 hover:text-accent-text", className)}>
      <CountryTag country={country} />
      <span className="truncate">
        <span className="text-ink-3">{country} · </span>
        {name}
      </span>
    </Link>
  );
}

export function EdgeBadge({ edge }: { edge: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-text tabular">
      <span aria-hidden>▲</span>+{(edge * 100).toFixed(1)}%
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "bad" | "warn" | "accent" }) {
  const t = {
    neutral: "bg-surface-2 text-ink-2",
    good: "bg-good-soft text-good",
    bad: "bg-bad-soft text-bad",
    warn: "bg-warn-soft text-warn",
    accent: "bg-accent-soft text-accent-text",
  }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", t)}>{children}</span>;
}

/** Won / lost mark for a settled pick. */
export function ResultMark({ won }: { won: boolean | null }) {
  if (won === null) return <span className="text-xs text-ink-3">void</span>;
  return (
    <span
      className={cx("inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold", won ? "bg-good-soft text-good" : "bg-bad-soft text-bad")}
      aria-label={won ? "Won" : "Lost"}
    >
      {won ? "✓" : "✕"}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface/50 px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-ink-3">{children}</div>}
    </div>
  );
}

/** Segmented pill tabs rendered as links, so the selection lives in the URL. */
export function LinkTabs({ items }: { items: { href: string; label: ReactNode; active: boolean }[] }) {
  return (
    <nav className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          scroll={false}
          aria-current={t.active ? "page" : undefined}
          className={cx(
            "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
            t.active ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export const chip = (active: boolean) =>
  cx(
    "shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
    active ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
  );

export const input =
  "h-9 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 hover:border-line-strong focus:border-accent focus:outline-none";

export const button = (variant: "primary" | "secondary" | "ghost" = "secondary") =>
  cx(
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:opacity-50",
    variant === "primary" && "bg-accent text-accent-ink hover:opacity-90",
    variant === "secondary" && "border border-line bg-surface text-ink hover:border-line-strong",
    variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
  );

/** Label above a control. */
export function Field({ label, children, className = "" }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}

/** Hit count as "8/10" with the rate as a percentage. */
export function HitRate({ hits, n }: { hits: number | undefined; n: number | undefined }) {
  if (!n || hits == null) return <span className="text-ink-3">–</span>;
  return (
    <span className="tabular">
      <span className="font-semibold">{Math.round((hits / n) * 100)}%</span>
      <span className="ml-1 text-xs text-ink-3">{hits}/{n}</span>
    </span>
  );
}

/** Placeholder while a page's URL-dependent content streams in. */
export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-40 rounded-2xl bg-surface-2" />
      <div className="h-10 rounded-xl bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-surface-2" />)}
      </div>
      <div className="h-64 rounded-xl bg-surface-2" />
    </div>
  );
}

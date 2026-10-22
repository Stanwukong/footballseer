import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold">{children}</h2>
      {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold tabular sm:text-2xl">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children && <div className="mt-1 max-w-3xl text-sm text-ink-2">{children}</div>}
    </header>
  );
}

/** Thin single-value meter for a probability. */
export function Meter({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full rounded bg-surface-2" aria-hidden>
      <div className="h-full rounded bg-home" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function EdgeBadge({ edge }: { edge: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent tabular">
      <span aria-hidden>▲</span>+{(edge * 100).toFixed(1)}%
    </span>
  );
}

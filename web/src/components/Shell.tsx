"use client";

import {
  BadgePercent, CalendarClock, CalendarDays, ChartColumn, Dices, FlaskConical, Flame, History, LayoutGrid, Menu, Newspaper,
  Radar, Radio, Search, SlidersHorizontal, Star, Swords, Trophy, Users, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { OddsSwitch, ThemeSwitch } from "@/components/client";
import { cx } from "@/components/ui";
import { useLiveFeed } from "@/lib/live-client";
import { NAV, type NavIcon } from "@/lib/nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  live: Radio, matches: LayoutGrid, value: BadgePercent, daily: CalendarDays, previews: Newspaper, favourites: Star,
  filters: SlidersHorizontal, machine: Dices, scanner: Radar, trends: Flame, teamStats: Users,
  leagueStats: ChartColumn, predictor: Swords, leagues: Trophy, record: History, lookback: CalendarClock,
};

function Brand() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5">
      <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-ink text-bg">
        <FlaskConical size={15} strokeWidth={2} />
      </span>
      <span className="font-display text-[17px] font-semibold tracking-tight">
        Football<span className="text-accent-text">Seer</span>
      </span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const { liveCount } = useLiveFeed();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-5">
      {NAV.map((s) => (
        <div key={s.title}>
          <p className="eyebrow px-3 pb-1.5">{s.title}</p>
          <ul className="flex flex-col gap-px">
            {s.items.map((i) => {
              const Icon = ICONS[i.icon];
              const on = active(i.href);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    className={cx(
                      "flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                      on ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <Icon size={16} strokeWidth={1.75} className={on ? "text-accent-text" : "text-ink-3"} />
                    {i.label}
                    {i.icon === "live" && liveCount > 0 && (
                      <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-bad px-1.5 font-mono text-[10px] font-semibold text-white tabular" aria-label={`${liveCount} matches in play`}>
                        {liveCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SearchBox({ className = "", onDone }: { className?: string; onDone?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className={cx("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/");
        onDone?.();
      }}
    >
      <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Team, league or country"
        aria-label="Search matches"
        className="h-9 w-full rounded-lg border border-line bg-surface-2 pr-3 pl-9 text-sm placeholder:text-ink-3 hover:border-line-strong focus:border-accent focus:bg-surface focus:outline-none"
      />
    </form>
  );
}

export function Shell({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer on navigation; Next keeps visited pages mounted, so state would otherwise survive.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="-ml-1.5 inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 lg:hidden"
            aria-label="Open navigation"
            aria-expanded={open}
          >
            <Menu size={20} />
          </button>
          <Brand />
          <SearchBox className="ml-6 hidden w-full max-w-sm md:block" />
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <OddsSwitch />
              <ThemeSwitch />
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 md:hidden"
              aria-label="Search"
            >
              <Search size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-line px-3 py-5 lg:block">
          <NavList />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <main id="main" className="mx-auto w-full max-w-300 flex-1 px-4 py-6 sm:py-8 lg:px-8">{children}</main>
          {footer}
        </div>
      </div>

      {/* Mobile drawer */}
      <div className={cx("fixed inset-0 z-40 lg:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open}>
        <div
          className={cx("absolute inset-0 bg-black/40 transition-opacity", open ? "opacity-100" : "opacity-0")}
          onClick={() => setOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={cx(
            "absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r border-line bg-bg shadow-raised transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
            <Brand />
            <button type="button" onClick={() => setOpen(false)} className="inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2" aria-label="Close navigation">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <SearchBox className="mb-5 px-1" onDone={() => setOpen(false)} />
            <NavList onNavigate={() => setOpen(false)} />
          </div>
          <div className="flex shrink-0 flex-col gap-3 border-t border-line p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="eyebrow">Theme</span>
              <ThemeSwitch withLabels />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="eyebrow">Odds</span>
              <OddsSwitch />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

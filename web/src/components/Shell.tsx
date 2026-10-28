"use client";

import {
  BadgePercent, CalendarClock, CalendarDays, ChartColumn, Check, ChevronsUpDown, Dices, Flame, History, LayoutGrid, ListOrdered,
  Menu, Newspaper, Radar, Radio, Search, SlidersHorizontal, Star, Swords, Ticket, Trophy, Users, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { OddsSwitch, ThemeSwitch } from "@/components/client";
import { LogoMark } from "@/components/Logo";
import { SportIcon } from "@/components/SportIcon";
import { Tour } from "@/components/Tour";
import { cx } from "@/components/ui";
import { useBasketballFeed, useLiveFeed, useTennisFeed } from "@/lib/live-client";
import { navFor, SPORTS, sportHref, sportOf, type NavIcon, type Sport } from "@/lib/nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  live: Radio, matches: LayoutGrid, value: BadgePercent, daily: CalendarDays, previews: Newspaper, favourites: Star,
  filters: SlidersHorizontal, machine: Dices, scanner: Radar, trends: Flame, teamStats: Users,
  leagueStats: ChartColumn, predictor: Swords, leagues: Trophy, record: History, lookback: CalendarClock, ratings: ListOrdered, code: Ticket,
};

function Brand({ sport }: { sport: Sport }) {
  return (
    <Link href={sportHref(sport, "/")} className="flex shrink-0 items-center gap-2.5">
      <LogoMark className="size-7" />
      <span className="font-display text-[17px] font-semibold tracking-tight">
        {SPORTS.find((s) => s.id === sport)!.label}<span className="text-accent-text">Seer</span>
      </span>
    </Link>
  );
}

function LiveBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-bad px-1.5 font-mono text-[10px] font-semibold text-white tabular" aria-label={`${count} games in play`}>
      {count}
    </span>
  );
}

// One component per sport, so only the current sport's live feed is polled.
function FootballLive() {
  return <LiveBadge count={useLiveFeed().liveCount} />;
}

function BasketballLive() {
  return <LiveBadge count={useBasketballFeed().liveCount} />;
}

function TennisLive() {
  return <LiveBadge count={useTennisFeed().liveCount} />;
}

const LIVE_BADGE: Record<Sport, () => ReactNode> = { football: FootballLive, basketball: BasketballLive, tennis: TennisLive };

/**
 * The sport picker: a button that opens a short list. On large screens the list
 * drops down under the button; on phones and tablets it's a dialog in the middle
 * of the screen. It renders into <body>, because the mobile drawer's slide
 * transform would otherwise pin a fixed dialog to the drawer, not the screen.
 */
function SportPicker({ sport, onNavigate }: { sport: Sport; onNavigate?: () => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const current = SPORTS.find((s) => s.id === sport)!;
  const close = useCallback((refocus = true) => {
    setAnchor(null);
    if (refocus) button.current?.focus();
  }, []);
  return (
    <>
      <button
        ref={button}
        type="button"
        data-tour="sport"
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={() => setAnchor(button.current!.getBoundingClientRect())}
        className="mx-1 flex h-12 items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 text-left transition-colors hover:border-line-strong"
      >
        <SportIcon sport={sport} className="size-5 shrink-0 text-accent-text" />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[10px] tracking-wider text-ink-3 uppercase">Sport</span>
          <span className="block truncate text-sm font-medium">{current.label}</span>
        </span>
        <ChevronsUpDown size={15} className="shrink-0 text-ink-3" />
      </button>
      {anchor && createPortal(<SportDialog sport={sport} anchor={anchor} onClose={close} onNavigate={onNavigate} />, document.body)}
    </>
  );
}

function SportDialog({ sport, anchor, onClose, onNavigate }: { sport: Sport; anchor: DOMRect; onClose: (refocus?: boolean) => void; onNavigate?: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const title = useId();

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("[aria-current]")?.focus();
    // The desktop list is pinned to where the button was; a resize would leave it behind.
    const onResize = () => onClose(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [onClose]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    // Stop here so the mobile drawer underneath doesn't close too.
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    // Arrows and Tab cycle through the options; focus stays in the dialog.
    const items = [...(panel.current?.querySelectorAll<HTMLElement>("a, button") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : e.key === "Tab" ? (e.shiftKey ? -1 : 1) : 0;
    if (!step || !items.length) return;
    e.preventDefault();
    items[(at + step + items.length) % items.length].focus();
  };

  const place = { "--x": `${anchor.left}px`, "--y": `${anchor.bottom + 6}px`, "--w": `${anchor.width}px` } as CSSProperties;
  return (
    <div className="fixed inset-0 z-50" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-black/40 lg:bg-transparent" onClick={() => onClose()} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title}
        style={place}
        className={cx(
          "absolute top-1/2 left-1/2 w-[min(22rem,calc(100vw-2rem))] -translate-1/2 rounded-2xl border border-line bg-surface p-2 shadow-raised",
          "lg:top-(--y) lg:left-(--x) lg:w-max lg:min-w-(--w) lg:translate-0 lg:rounded-xl lg:p-1",
        )}
      >
        <div className="flex items-center justify-between px-3 pt-1.5 pb-2 lg:sr-only">
          <h2 id={title} className="font-display text-[15px] font-semibold tracking-tight">Choose a sport</h2>
          <button type="button" onClick={() => onClose()} className="-mr-1.5 inline-flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <ul className="flex flex-col gap-px">
          {SPORTS.map((s) => {
            const on = s.id === sport;
            return (
              <li key={s.id}>
                <Link
                  href={sportHref(s.id, "/")}
                  aria-current={on ? "page" : undefined}
                  onClick={() => {
                    onClose(false);
                    onNavigate?.();
                  }}
                  className={cx(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-accent lg:py-2",
                    on ? "bg-surface-3" : "hover:bg-surface-2",
                  )}
                >
                  <SportIcon sport={s.id} className={cx("size-5 shrink-0", on ? "text-accent-text" : "text-ink-3")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{s.label}</span>
                    <span className="block truncate text-xs text-ink-3">{s.blurb}</span>
                  </span>
                  {on && <Check size={16} className="shrink-0 text-accent-text" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const sport = sportOf(pathname);
  const home = sportHref(sport, "/");
  const active = (href: string) => (href === home ? pathname === home : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Primary" className="flex flex-col gap-5">
      <SportPicker sport={sport} onNavigate={onNavigate} />
      {navFor(sport).map((s) => (
        <div key={s.title}>
          <p className="eyebrow px-3 pb-1.5">{s.title}</p>
          <ul className="flex flex-col gap-px">
            {s.items.map((i) => {
              const Icon = ICONS[i.icon];
              const Live = LIVE_BADGE[sport];
              const href = sportHref(sport, i.href);
              const on = active(href);
              return (
                <li key={i.href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    data-tour={`nav-${i.icon}`}
                    className={cx(
                      "flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                      on ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <Icon size={16} strokeWidth={1.75} className={on ? "text-accent-text" : "text-ink-3"} />
                    {i.label}
                    {i.icon === "live" && <Live />}
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
  const home = sportHref(sportOf(usePathname()), "/");
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className={cx("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `${home}?q=${encodeURIComponent(q.trim())}` : home);
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
  const sport = sportOf(pathname);

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
            data-tour="menu"
            aria-expanded={open}
          >
            <Menu size={20} />
          </button>
          <Brand sport={sport} />
          <SearchBox className="ml-6 hidden w-full max-w-sm md:block" />
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex" data-tour="odds">
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
            <Brand sport={sport} />
            <button type="button" onClick={() => setOpen(false)} className="inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2" aria-label="Close navigation">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <SearchBox className="mb-5 px-1" onDone={() => setOpen(false)} />
            <NavList onNavigate={() => setOpen(false)} />
          </div>
          <div className="flex shrink-0 flex-col gap-3 border-t border-line p-4" data-tour="odds">
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

      <Tour />
    </div>
  );
}

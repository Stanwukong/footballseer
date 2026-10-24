"use client";

import { MousePointerClick, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import { LogoMark } from "@/components/Logo";
import { cx } from "@/components/ui";
import { sportHref, sportOf, type Sport } from "@/lib/nav";
import { usePref } from "@/lib/prefs";
import { onPage, tourKey, tourSteps, type TourStep } from "@/lib/tour";

/*
 * First-visit tour: a dimmed page with a hole over the step's element and a
 * small card beside it. Progress is the current step id in localStorage
 * (per sport), so a reload or a navigation resumes where the reader was;
 * "done" ends it. A step off its page rewinds to the nearest earlier step
 * that belongs here, and a step whose element never shows is skipped.
 */

const DONE = "done";
const MISSING_MS = 4000;
const PAD = 6;
const GAP = 12;
const EDGE = 16;
const HEADER = 56;

const noopSubscribe = () => () => {};
const useMounted = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

function shown(el: Element) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth && !el.closest('[aria-hidden="true"]');
}

function find(selector?: string) {
  if (!selector) return null;
  for (const el of document.querySelectorAll(selector)) if (shown(el)) return el;
  return null;
}

interface Geo {
  step: string;
  box: { top: number; left: number; width: number; height: number } | null;
  fallback: boolean;
  vw: number;
  vh: number;
  cw: number;
  ch: number;
}

const sameGeo = (a: Geo | null, b: Geo) =>
  !!a && a.step === b.step && a.fallback === b.fallback && a.vw === b.vw && a.vh === b.vh && a.cw === b.cw && a.ch === b.ch &&
  (a.box === b.box || (!!a.box && !!b.box && a.box.top === b.box.top && a.box.left === b.box.left && a.box.width === b.box.width && a.box.height === b.box.height));

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

/** Below the element if it fits, else above, else beside, else the bottom corner. Phones get a sheet. */
function place({ box, vw, vh, ch }: Geo): CSSProperties {
  if (!box) {
    const width = Math.min(400, vw - 2 * EDGE);
    return { width, left: (vw - width) / 2, top: Math.max(EDGE, (vh - ch) / 2) };
  }
  if (vw < 640) {
    const low = box.top + box.height / 2 > vh / 2;
    return { left: 12, width: vw - 24, top: low ? HEADER + 12 : vh - 12 - ch };
  }
  const width = Math.min(352, vw - 2 * EDGE);
  const left = clamp(box.left + box.width / 2 - width / 2, EDGE, vw - EDGE - width);
  const below = box.top + box.height + PAD + GAP;
  if (below + ch <= vh - EDGE) return { width, left, top: below };
  const above = box.top - PAD - GAP - ch;
  if (above >= EDGE) return { width, left, top: above };
  const top = clamp(box.top, EDGE, vh - EDGE - ch);
  const right = box.left + box.width + PAD + GAP;
  if (right + width <= vw - EDGE) return { width, left: right, top };
  if (box.left - PAD - GAP - width >= EDGE) return { width, left: box.left - PAD - GAP - width, top };
  return { width, left: vw - EDGE - width, top: vh - EDGE - ch };
}

export function Tour() {
  return useMounted() ? <TourRun /> : null;
}

function TourRun() {
  const pathname = usePathname();
  const router = useRouter();
  const sport = sportOf(pathname);
  const steps = useMemo(() => tourSteps(sport), [sport]);
  const [stored, setStored] = usePref(tourKey(sport), "");

  // Which step shows here: a first visit starts on the home page; a step from another page rewinds.
  let idx = stored === DONE ? -1 : stored === "" ? (onPage("home", pathname, sport) ? 0 : -1) : steps.findIndex((s) => s.id === stored);
  while (idx >= 0 && !onPage(steps[idx].page, pathname, sport)) idx--;
  const step: TourStep | null = idx >= 0 ? steps[idx] : null;

  const go = (i: number) => setStored(i >= steps.length ? DONE : steps[i].id);
  const canBack = idx > 0 && onPage(steps[idx - 1].page, pathname, sport);

  // A ?tour=1 link restarts the tour from the top.
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current) return;
    linked.current = true;
    if (new URLSearchParams(window.location.search).get("tour") !== "1") return;
    setStored(steps[0].id);
    router.replace(sportHref(sport, "/"));
  }, [router, setStored, sport, steps]);

  // Follow the element every frame (scrolling, resizing, the drawer sliding in), and skip it if it never appears.
  const cardRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  useEffect(() => {
    if (!step) return;
    let missingSince = performance.now();
    let scrolled = false;
    let raf = 0;
    const tick = () => {
      // The route has changed under us; this loop is about to be replaced, so don't act on the old page.
      if (window.location.pathname !== pathname) return;
      const primary = find(step.target);
      const el = primary ?? find(step.fallback);
      if (el) missingSince = performance.now();
      else if (step.target && performance.now() - missingSince > MISSING_MS) {
        let j = idx + 1;
        while (j < steps.length && !onPage(steps[j].page, pathname, sport)) j++;
        setStored(j >= steps.length ? DONE : steps[j].id);
        return;
      }
      if (el && !scrolled) {
        scrolled = true;
        const r = el.getBoundingClientRect();
        if (r.top < HEADER + EDGE || r.bottom > window.innerHeight - EDGE) {
          const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? "start" : "center", behavior: reduce ? "auto" : "smooth" });
        }
      }
      const r = el?.getBoundingClientRect();
      const next: Geo = {
        step: step.id,
        box: r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null,
        fallback: !primary && !!el,
        vw: window.innerWidth,
        vh: window.innerHeight,
        cw: cardRef.current?.offsetWidth ?? 0,
        ch: cardRef.current?.offsetHeight ?? 0,
      };
      setGeo((prev) => (sameGeo(prev, next) ? prev : next));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, idx, pathname, sport, steps, setStored]);

  // "Click" steps move on when the reader clicks the element itself (not a button nested in it, like a row's star).
  useEffect(() => {
    if (!step || step.advance !== "click" || !step.target) return;
    const selector = step.target;
    const onClick = (e: MouseEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      const hit = t?.closest(selector);
      if (!hit) return;
      const button = t!.closest("button");
      if (button && button !== hit && hit.contains(button)) return;
      setStored(idx + 1 >= steps.length ? DONE : steps[idx + 1].id);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [step, idx, steps, setStored]);

  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setStored(DONE);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, setStored]);

  // Move focus to the card's main action as each step opens, so keyboard and screen-reader users follow along.
  const primaryRef = useRef<HTMLButtonElement>(null);
  const stepId = step?.id;
  useEffect(() => {
    if (!stepId) return;
    (primaryRef.current ?? cardRef.current)?.focus({ preventScroll: true });
  }, [stepId]);

  const titleId = useId();
  const bodyId = useId();
  if (!step) return null;

  const g = geo?.step === step.id ? geo : null;
  const hole = g?.box && {
    top: g.box.top - PAD,
    left: g.box.left - PAD,
    width: g.box.width + 2 * PAD,
    height: g.box.height + 2 * PAD,
  };
  const welcome = idx === 0;

  return (
    <div className="fixed inset-0 z-60" style={{ pointerEvents: "none" }}>
      {hole ? (
        <>
          {/* Four panes around the hole catch stray clicks; the hole itself stays live. */}
          <div className="pointer-events-auto absolute inset-x-0 top-0" style={{ height: Math.max(0, hole.top) }} />
          <div className="pointer-events-auto absolute inset-x-0 bottom-0" style={{ top: hole.top + hole.height }} />
          <div className="pointer-events-auto absolute left-0" style={{ top: hole.top, height: hole.height, width: Math.max(0, hole.left) }} />
          <div className="pointer-events-auto absolute right-0" style={{ top: hole.top, height: hole.height, left: hole.left + hole.width }} />
          <div
            aria-hidden
            className="absolute rounded-xl shadow-[0_0_0_9999px_rgb(0_0_0/0.5)] ring-2 ring-accent transition-all duration-200 motion-reduce:transition-none"
            style={hole}
          />
        </>
      ) : (
        <div className={cx("pointer-events-auto absolute inset-0 bg-black/50", !step.target && "tour-in")} />
      )}

      <div
        key={step.id}
        ref={cardRef}
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="tour-in pointer-events-auto fixed rounded-xl border border-line bg-surface p-4 text-ink shadow-raised outline-none"
        style={{ ...(g ? place(g) : { width: 0 }), visibility: g ? "visible" : "hidden" }}
      >
        <div className="flex items-start justify-between gap-3">
          {welcome ? <LogoMark className="size-10" /> : <p className="eyebrow pt-1">Step {idx} of {steps.length - 1}</p>}
          <button
            type="button"
            onClick={() => setStored(DONE)}
            className="-mt-1 -mr-1 inline-flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
            aria-label="Close tour"
          >
            <X size={16} />
          </button>
        </div>
        <h2 id={titleId} className={cx("font-display font-semibold tracking-tight", welcome ? "mt-3 text-lg" : "mt-1.5 text-base")}>
          {step.title}
        </h2>
        <p id={bodyId} className="mt-1 text-sm leading-relaxed text-ink-2">
          {step.body}
          {g?.fallback && step.fallbackHint && <span className="font-medium text-ink"> {step.fallbackHint}</span>}
        </p>

        <div className="mt-4 flex items-center justify-between gap-3">
          {welcome ? (
            <button type="button" onClick={() => setStored(DONE)} className="text-[13px] text-ink-3 hover:text-ink">
              Not now
            </button>
          ) : (
            <Dots count={steps.length - 1} at={idx - 1} />
          )}
          <div className="flex items-center gap-2">
            {canBack && !welcome && (
              <button type="button" onClick={() => go(idx - 1)} className="h-8 rounded-lg px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
                Back
              </button>
            )}
            {step.advance === "ack" ? (
              <button
                ref={primaryRef}
                type="button"
                onClick={() => go(idx + 1)}
                className="h-8 rounded-lg bg-ink px-3.5 text-[13px] font-semibold text-bg hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
              >
                {step.cta ?? "Got it"}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-text">
                <MousePointerClick size={15} strokeWidth={1.75} />
                Click to continue
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Dots({ count, at }: { count: number; at: number }) {
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={cx("h-1.5 rounded-full transition-all", i === at ? "w-4 bg-accent" : i < at ? "w-1.5 bg-ink-3" : "w-1.5 bg-line-strong")} />
      ))}
    </div>
  );
}

/** Footer link that replays the tour for the current sport. */
export function TourLink({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const sport: Sport = sportOf(pathname);
  const [, setStored] = usePref(tourKey(sport), "");
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        setStored(tourSteps(sport)[0].id);
        router.push(sportHref(sport, "/"));
      }}
    >
      Take the tour
    </button>
  );
}

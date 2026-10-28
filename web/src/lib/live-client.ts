"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { LiveDetail as BasketballDetail, LiveFeed as BasketballFeed } from "./basketball/types";
import type { TennisFeed } from "./tennis/types";
import type { LiveDetail, LiveFeed, LiveState } from "./types";

/*
 * One poller per live feed for the whole app. It runs while any component is
 * subscribed and the tab is visible, refreshing every 30 s; a hidden tab stops
 * polling and refreshes as soon as it's shown again.
 */

const FEED_MS = 30_000;
const DETAIL_MS = 20_000;

interface FeedState<F> {
  feed: F | null;
  error: boolean;
}

interface FeedItem {
  fixture?: string | null;
  state: LiveState;
}

function createFeed<F, E extends FeedItem>(url: string, items: (f: F) => E[]) {
  let state: FeedState<F> = { feed: null, error: false };
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight = false;

  const emit = (next: FeedState<F>) => {
    state = next;
    listeners.forEach((l) => l());
  };

  async function poll() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (document.hidden || !listeners.size) return;
    if (!inflight) {
      inflight = true;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        emit({ feed: (await res.json()) as F, error: false });
      } catch {
        emit({ ...state, error: true });
      } finally {
        inflight = false;
      }
    }
    if (listeners.size && !document.hidden) timer = setTimeout(poll, FEED_MS);
  }

  const onVisibility = () => {
    if (!document.hidden) poll();
  };

  function subscribe(cb: () => void) {
    listeners.add(cb);
    if (listeners.size === 1) {
      document.addEventListener("visibilitychange", onVisibility);
      poll();
    }
    return () => {
      listeners.delete(cb);
      if (!listeners.size) {
        document.removeEventListener("visibilitychange", onVisibility);
        if (timer) clearTimeout(timer);
        timer = null;
      }
    };
  }

  const SERVER: FeedState<F> = { feed: null, error: false };

  return function useFeed(): FeedState<F> & { byFixture: Map<string, E>; liveCount: number } {
    const s = useSyncExternalStore(subscribe, () => state, () => SERVER);
    const byFixture = useMemo(() => {
      const m = new Map<string, E>();
      for (const e of s.feed ? items(s.feed) : []) if (e.fixture) m.set(e.fixture, e);
      return m;
    }, [s.feed]);
    const liveCount = useMemo(() => (s.feed ? items(s.feed) : []).filter((e) => e.state === "in").length, [s.feed]);
    return { ...s, byFixture, liveCount };
  };
}

/** Football: ESPN soccer scoreboards, with SportyBet's market view. */
export const useLiveFeed = createFeed("/api/live", (f: LiveFeed) => f.events);
/** Basketball: ESPN and EuroLeague scoreboards, with SportyBet's market view. */
export const useBasketballFeed = createFeed("/api/basketball/live", (f: BasketballFeed) => f.events);
/** Tennis: SportyBet in play and upcoming, LiveScore results. */
export const useTennisFeed = createFeed("/api/tennis/feed", (f: TennisFeed) => f.matches);

function useDetail<D extends { event: { state: LiveState } }>(url: string | null, feedState: LiveState | undefined) {
  const active = feedState === "in" || feedState === "post";
  const [detail, setDetail] = useState<D | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!url || !active) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      if (document.hidden) {
        t = setTimeout(load, DETAIL_MS);
        return;
      }
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const d = (await res.json()) as D;
        if (stop) return;
        setDetail(d);
        setError(false);
        if (d.event.state !== "in") return; // finished or not started: one fetch is enough
      } catch {
        if (!stop) setError(true);
      }
      if (!stop) t = setTimeout(load, DETAIL_MS);
    };
    load();
    return () => {
      stop = true;
      if (t) clearTimeout(t);
    };
  }, [url, active, feedState]);
  return { detail, error };
}

/**
 * Full detail for one match, refreshed while it's in play. Keyed on the feed's
 * state so it starts at kick-off and takes one last read at full time.
 */
export function useLiveDetail(espn: string | null, feedState: LiveState | undefined) {
  return useDetail<LiveDetail>(espn ? `/api/live/${espn}` : null, feedState);
}

export function useBasketballDetail(live: string | null, feedState: LiveState | undefined) {
  return useDetail<BasketballDetail>(live ? `/api/basketball/live/${live}` : null, feedState);
}

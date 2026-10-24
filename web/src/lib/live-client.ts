"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { LiveDetail, LiveEvent, LiveFeed, LiveState } from "./types";

/*
 * One poller for the whole app. It runs while any component is subscribed and
 * the tab is visible, refreshing every 30 s; a hidden tab stops polling and
 * refreshes as soon as it's shown again.
 */

const FEED_MS = 30_000;
const DETAIL_MS = 20_000;

interface FeedState {
  feed: LiveFeed | null;
  error: boolean;
}

let state: FeedState = { feed: null, error: false };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight = false;

function emit(next: FeedState) {
  state = next;
  listeners.forEach((l) => l());
}

async function poll() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (document.hidden || !listeners.size) return;
  if (!inflight) {
    inflight = true;
    try {
      const res = await fetch("/api/live", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      emit({ feed: (await res.json()) as LiveFeed, error: false });
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

const SERVER: FeedState = { feed: null, error: false };

export function useLiveFeed(): FeedState & { byFixture: Map<string, LiveEvent>; liveCount: number } {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER);
  const byFixture = useMemo(() => {
    const m = new Map<string, LiveEvent>();
    for (const e of s.feed?.events ?? []) if (e.fixture) m.set(e.fixture, e);
    return m;
  }, [s.feed]);
  const liveCount = useMemo(() => (s.feed?.events ?? []).filter((e) => e.state === "in").length, [s.feed]);
  return { ...s, byFixture, liveCount };
}

/**
 * Full detail for one match, refreshed while it's in play. Keyed on the feed's
 * state so it starts at kick-off and takes one last read at full time.
 */
export function useLiveDetail(espn: string | null, feedState: LiveState | undefined) {
  const active = feedState === "in" || feedState === "post";
  const [detail, setDetail] = useState<LiveDetail | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!espn || !active) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      if (document.hidden) {
        t = setTimeout(load, DETAIL_MS);
        return;
      }
      try {
        const res = await fetch(`/api/live/${espn}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const d = (await res.json()) as LiveDetail;
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
  }, [espn, active, feedState]);
  return { detail, error };
}

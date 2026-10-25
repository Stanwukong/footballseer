"use client";

import { useSyncExternalStore } from "react";

/*
 * Today's date (UTC, like the pipeline) as the browser sees it. Pages are
 * prerendered at deploy time and the pipeline's as_of trails the calendar until
 * its next run, so neither can say what "today" is for the viewer. The server
 * render uses `fallback`; the client swaps in the real date on hydration and
 * re-checks every minute so the board rolls over at midnight.
 */

const utcToday = () => new Date().toISOString().slice(0, 10);

function subscribe(cb: () => void) {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
}

export function useToday(fallback: string) {
  return useSyncExternalStore(subscribe, utcToday, () => fallback || utcToday());
}

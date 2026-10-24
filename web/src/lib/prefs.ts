"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { OddsFormat } from "./format";

/*
 * Per-browser preferences kept in localStorage: theme, odds format, favourite
 * matches and leagues, saved filters. Reads go through useSyncExternalStore so
 * the server render (no storage) and the first client render agree, and every
 * component using a key updates when it changes.
 */

const listeners = new Map<string, Set<() => void>>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // private mode or storage blocked: the preference lasts for this page only
  }
  listeners.get(key)?.forEach((l) => l());
}

function subscribe(key: string, cb: () => void) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(cb);
  const onStorage = (e: StorageEvent) => e.key === key && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.get(key)!.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePref(key: string, fallback: string): [string, (v: string | null) => void] {
  const value = useSyncExternalStore(
    useCallback((cb) => subscribe(key, cb), [key]),
    () => read(key) ?? fallback,
    () => fallback,
  );
  return [value, useCallback((v: string | null) => write(key, v), [key])];
}

/** A JSON value; the raw string is the snapshot so the reference stays stable between reads. */
export function useJsonPref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [raw, set] = usePref(key, "");
  let value = fallback;
  if (raw) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      // ignore corrupt values
    }
  }
  return [value, useCallback((v: T) => set(JSON.stringify(v)), [set])];
}

export type Theme = "system" | "light" | "dark";

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = usePref("fs-theme", "system");
  return [
    theme as Theme,
    (t: Theme) => {
      set(t === "system" ? null : t);
      if (t === "system") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", t);
    },
  ];
}

export function useOddsFormat(): [OddsFormat, (f: OddsFormat) => void] {
  const [f, set] = usePref("fs-odds", "decimal");
  return [f as OddsFormat, set as (f: OddsFormat) => void];
}

/** Starred items (match ids or league codes) as a set-like API. */
export function useFavourites(kind: "matches" | "leagues") {
  const [ids, set] = useJsonPref<string[]>(`fs-fav-${kind}`, []);
  const has = (id: string) => ids.includes(id);
  const toggle = (id: string) => set(has(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  return { ids, has, toggle };
}

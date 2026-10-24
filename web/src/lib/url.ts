"use client";

import { usePathname, useRouter } from "next/navigation";

type Params = URLSearchParams | { get(k: string): string | null; toString(): string };

/**
 * Filters that live in the URL, so a view can be bookmarked or shared.
 * Values equal to their default are dropped from the URL.
 */
export function useUrlState(sp: Params, defaults: Record<string, string>) {
  const router = useRouter();
  const pathname = usePathname();
  const get = (k: string) => sp.get(k) ?? defaults[k] ?? "";
  const set = (patch: Record<string, string | null>, replaceAll = false) => {
    const next = new URLSearchParams(replaceAll ? "" : sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === defaults[k]) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };
  return { get, set };
}

export const EMPTY_PARAMS = new URLSearchParams();

"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { chip, cx } from "@/components/ui";
import { formatDay } from "@/lib/format";
import type { LeagueInfo } from "@/lib/types";

/** Multi-select of leagues grouped by country. An empty selection means all leagues. */
export function LeaguePicker({ leagues, value, onChange }: { leagues: LeagueInfo[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const countries = new Map<string, LeagueInfo[]>();
  for (const l of leagues) countries.set(l.country, [...(countries.get(l.country) ?? []), l]);
  const toggle = (codes: string[], on: boolean) => onChange(on ? [...new Set([...value, ...codes])] : value.filter((c) => !codes.includes(c)));
  const label = value.length === 0 ? "All leagues" : value.length === 1 ? leagues.find((l) => l.code === value[0])?.name : `${value.length} leagues`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 text-sm hover:border-line-strong"
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={15} className="shrink-0 text-ink-3" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-80 w-full min-w-64 overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-raised">
          <button type="button" onClick={() => onChange([])} className="mb-1 w-full rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-surface-2">
            All leagues
          </button>
          {[...countries.entries()].map(([country, ls]) => {
            const codes = ls.map((l) => l.code);
            const all = codes.every((c) => value.includes(c));
            return (
              <div key={country} className="py-1">
                <label className="flex items-center gap-2 rounded-md px-2 py-1 text-xs font-semibold tracking-wide text-ink-3 uppercase hover:bg-surface-2">
                  <input type="checkbox" checked={all} onChange={(e) => toggle(codes, e.target.checked)} />
                  {country}
                </label>
                {ls.map((l) => (
                  <label key={l.code} className="flex items-center gap-2 rounded-md py-1 pr-2 pl-7 text-sm hover:bg-surface-2">
                    <input type="checkbox" checked={value.includes(l.code)} onChange={(e) => toggle([l.code], e.target.checked)} />
                    {l.name}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Day chips; an empty selection means every day. */
export function DayPicker({ days, value, onChange, today }: { days: string[]; value: string[]; onChange: (v: string[]) => void; today: string }) {
  return (
    <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
      <button type="button" className={chip(value.length === 0)} onClick={() => onChange([])}>All days</button>
      {days.map((d) => (
        <button
          key={d}
          type="button"
          className={chip(value.includes(d))}
          onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d])}
        >
          {formatDay(d, today)}
        </button>
      ))}
    </div>
  );
}

/** Chips for picking one or several markets. */
export function MarketChips({ options, value, onChange, multi = true }: {
  options: { key: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  multi?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            className={cx(chip(on), "py-1 text-xs")}
            onClick={() => onChange(multi ? (on ? value.filter((x) => x !== o.key) : [...value, o.key]) : [o.key])}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Two-thumb range made of two number inputs, kept simple and keyboard-friendly. */
export function RangeInputs({ min, max, step, value, onChange, suffix = "" }: {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  suffix?: string;
}) {
  const cls = "h-9 w-full min-w-0 rounded-lg border border-line bg-surface px-2.5 text-sm tabular hover:border-line-strong focus:border-accent focus:outline-none";
  return (
    <div className="flex items-center gap-2">
      <input type="number" aria-label="Minimum" className={cls} min={min} max={value[1]} step={step} value={value[0]}
        onChange={(e) => onChange([Math.max(min, Number(e.target.value)), value[1]])} />
      <span className="text-ink-3">–</span>
      <input type="number" aria-label="Maximum" className={cls} min={value[0]} max={max} step={step} value={value[1]}
        onChange={(e) => onChange([value[0], Math.min(max, Number(e.target.value))])} />
      {suffix && <span className="text-sm text-ink-3">{suffix}</span>}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";

import { Odds } from "@/components/client";
import { SportIcon } from "@/components/SportIcon";
import { button, Card, cx, EmptyState, input, ProbPill, Stat, Tag } from "@/components/ui";
import { pct, signedPct } from "@/lib/format";
import { COUNTRIES, type Country } from "@/lib/sporty-countries";
import type { Slip, SlipLeg } from "@/lib/types";
import { EMPTY_PARAMS } from "@/lib/url";

/** An edge on a leg worth calling value, or a leak. */
const EDGE = 0.05;

/** Expected return per unit staked on one leg: the win pays the odds, a void hands the stake back. */
const legReturn = (l: SlipLeg) => (l.model ? l.model.p * l.odds + l.model.push : null);

/** The code box reads and writes ?code= and ?c=, so a decoded slip can be shared as a link. */
export function BookingCode() {
  return (
    <Suspense fallback={<Decoder code="" country="ng" />}>
      <DecoderWithUrl />
    </Suspense>
  );
}

function DecoderWithUrl() {
  const sp = useSearchParams() ?? EMPTY_PARAMS;
  const c = sp.get("c") ?? "ng";
  const code = sp.get("code") ?? "";
  const country = (c in COUNTRIES ? c : "ng") as Country;
  // A new code starts a fresh decoder, with the box filled from the URL.
  return <Decoder key={`${country}:${code}`} code={code} country={country} />;
}

function Decoder({ code, country }: { code: string; country: Country }) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(code);
  const [c, setC] = useState<Country>(country);
  const [result, setResult] = useState<{ slip: Slip | null; error: string | null } | null>(null);
  const state = { loading: !!code && !result, slip: result?.slip ?? null, error: result?.error ?? null };

  useEffect(() => {
    if (!code) return;
    let live = true;
    fetch(`/api/booking-code?code=${encodeURIComponent(code)}&c=${country}`)
      .then(async (r) => {
        const body = await r.json();
        if (!live) return;
        setResult(r.ok ? { slip: body as Slip, error: null } : { slip: null, error: body.error ?? "Couldn't load that code." });
      })
      .catch(() => live && setResult({ slip: null, error: "Couldn't reach the server. Check your connection." }));
    return () => {
      live = false;
    };
  }, [code, country]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim().toUpperCase();
    if (v) router.push(`${pathname}?code=${encodeURIComponent(v)}${c === "ng" ? "" : `&c=${c}`}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-xs">
          <span className="eyebrow">Booking code</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. 3A9KQ2"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className={cx(input, "font-mono uppercase tracking-wider")}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Country</span>
          <select value={c} onChange={(e) => setC(e.target.value as Country)} className={input}>
            {Object.entries(COUNTRIES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <button type="submit" className={button("primary")} disabled={!text.trim() || state.loading}>
          {state.loading ? "Decoding…" : "Decode"}
        </button>
      </form>

      {state.error && <EmptyState title="That code didn't load">{state.error} Codes stop working once every match on them has started.</EmptyState>}
      {state.loading && <div className="h-40 animate-pulse rounded-xl border border-line bg-surface" />}
      {state.slip && <SlipView slip={state.slip} />}
      {!code && !state.slip && (
        <EmptyState title="Paste a code to start">
          Copy the booking code from a SportyBet bet slip (yours or a tipster&apos;s). We read its selections, price each one with our models and
          show where the slip is strong and where it leaks value.
        </EmptyState>
      )}
    </div>
  );
}

function SlipView({ slip }: { slip: Slip }) {
  const priced = slip.legs.filter((l) => l.model);
  const all = priced.length === slip.legs.length;
  const pricedOdds = priced.reduce((a, l) => a * l.odds, 1);
  const chance = priced.length ? priced.reduce((a, l) => a * l.model!.p, 1) : null;
  const book = slip.legs.every((l) => l.book != null) ? slip.legs.reduce((a, l) => a * l.book!, 1) : null;
  const ret = priced.length ? priced.reduce((a, l) => a * legReturn(l)!, 1) : null;
  const shared = new Set(slip.legs.map((l) => l.eventId).filter((id, i, ids) => ids.indexOf(id) !== i));

  // Legs that cost the most, with what the slip returns without each.
  const leaks = priced
    .map((l) => ({ l, r: legReturn(l)! }))
    .filter((x) => x.r < 1 - EDGE)
    .sort((a, b) => a.r - b.r)
    .slice(0, 3)
    .map(({ l, r }) => ({ l, without: ret! / r }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Selections" value={slip.legs.length} sub={all ? "All priced by our models" : `${priced.length} priced by our models`} />
        <Stat label="Total odds" value={<Odds odds={slip.odds} />} sub={book != null ? `Bookmaker: ${pct(book, 1)} to win` : "Pays this many times your stake"} />
        <Stat label="Model's chance" value={chance == null ? "–" : pct(chance, chance < 0.01 ? 2 : 1)} sub={all ? "That every selection wins" : "Of the selections we price"} />
        <Stat
          label="Expected return"
          value={ret == null ? "–" : <span className={ret - 1 >= EDGE ? "text-good" : ret - 1 <= -EDGE ? "text-bad" : ""}>{signedPct(ret - 1)}</span>}
          sub={ret == null ? "No selection we price" : `Per stake${all ? "" : `, on odds of ${pricedOdds.toFixed(2)}`}`}
        />
      </div>

      {(leaks.length > 0 || shared.size > 0 || ret != null) && (
        <Card title="The model's read" hint="Every selection is treated as independent of the others">
          <ul className="space-y-2 text-sm leading-relaxed text-ink-2">
            {ret != null && (
              <li>
                {ret - 1 >= EDGE
                  ? `The model rates this slip as value: over many slips like it you'd make about ${signedPct(ret - 1, 0)} on your stakes.`
                  : ret - 1 > -EDGE
                    ? "The model rates this slip about fair: the odds match its chances, give or take."
                    : `At these odds the model expects you to lose about ${pct(1 - ret)} of your stake over many slips like this.`}{" "}
                {chance != null && chance < 0.1 && `It lands about once in ${Math.round(1 / chance).toLocaleString("en-GB")} tries.`}
              </li>
            )}
            {leaks.map(({ l, without }) => (
              <li key={l.eventId + l.market + l.pick}>
                <span className="font-medium text-ink">{l.home} v {l.away}, {l.pick}</span> is the model&apos;s{" "}
                {legReturn(l)! < 0.8 ? "weakest pick" : "a weak pick"}: {pct(l.model!.p)} against the {pct(1 / l.odds)} its odds need.
                Without it the slip&apos;s expected return is {signedPct(without - 1)}.
              </li>
            ))}
            {shared.size > 0 && (
              <li>
                <Tag tone="warn">Same match</Tag> Some selections are on the same match. They move together, so the combined chance above is
                only a rough guide.
              </li>
            )}
          </ul>
        </Card>
      )}

      <Card title="Selections" hint="Our chance against the price. Green beats the odds by 5 points or more." flush>
        <ul className="divide-y divide-line border-t border-line">
          {slip.legs.map((l, i) => <LegRow key={i} l={l} />)}
        </ul>
      </Card>

      <p className="text-xs text-ink-3">
        Decoded from SportyBet ({COUNTRIES[slip.country as Country] ?? slip.country}) code <span className="font-mono">{slip.code}</span>. Prices
        change after a code is made; check them on SportyBet before staking. Bet only what you can afford to lose.
      </p>
    </div>
  );
}

function LegRow({ l }: { l: SlipLeg }) {
  const r = legReturn(l);
  const edge = r == null ? null : r - 1;
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-ink-3">{l.sport ? <SportIcon sport={l.sport} /> : <span className="inline-block size-4" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
            <span className="truncate">{l.competition}</span>
            <span className="tabular">{startText(l.start)}</span>
            {l.state === "in" && <Tag tone="bad">In play</Tag>}
            {l.state === "post" && <Tag>Finished</Tag>}
          </div>
          <div className="mt-0.5 truncate font-medium">{l.home} v {l.away}</div>
          <div className="mt-0.5 text-sm">
            <span className="text-ink-3">{l.market}:</span> <span className="font-semibold">{l.pick}</span>
          </div>
          {l.context.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-ink-2">
              {l.context.map((c) => <li key={c}>{c}</li>)}
            </ul>
          )}
          {(l.note || l.links.length > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {l.note && <span className="text-ink-3">{l.note}</span>}
              {l.links.map((k) => (
                <Link key={k.href} href={k.href} className="font-medium text-accent-text hover:underline">{k.label} →</Link>
              ))}
            </div>
          )}
        </div>
        <div className="grid shrink-0 grid-cols-[auto_auto] items-center gap-x-3 gap-y-1 text-right text-xs">
          <span className="text-ink-3">Odds</span>
          <Odds odds={l.odds} className="text-sm" />
          <span className="text-ink-3">Book</span>
          <span className="tabular text-ink-2">{l.book != null ? pct(l.book) : "–"}</span>
          <span className="text-ink-3">Model</span>
          <span>{l.model ? <ProbPill p={l.model.p} size="sm" /> : <span className="text-ink-3">–</span>}</span>
          {edge != null && (
            <>
              <span className="text-ink-3">Edge</span>
              <span className={cx("font-semibold tabular", edge >= EDGE ? "text-good" : edge <= -EDGE ? "text-bad" : "text-ink-2")}>{signedPct(edge)}</span>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function startText(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

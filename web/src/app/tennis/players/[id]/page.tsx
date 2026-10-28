import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { EloChart } from "@/components/tennis/EloChart";
import { Card, cx, EmptyState, FormChips, Meter, PageHeader, PageSkeleton, ProbPill, ResultMark, Stat, Tag } from "@/components/ui";
import { formatDay, pct, shortDate } from "@/lib/format";
import { getMatches, getPlayerStats, getRatings } from "@/lib/tennis/data";
import { eloHistory, playerMatches, rivals, wlRate } from "@/lib/tennis/players";
import type { Surface, WL } from "@/lib/tennis/types";

const RECENT = 20;
const SURFACE_NAME: Record<Surface, string> = { hard: "Hard", clay: "Clay", grass: "Grass" };

/** The top 100 on each tour are built ahead; the rest render on first visit. */
export async function generateStaticParams() {
  return (await getRatings()).players.filter((p) => p.rank <= 100).map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: PageProps<"/tennis/players/[id]">): Promise<Metadata> {
  const { id } = await params;
  const p = (await getRatings()).players.find((x) => x.id === id);
  return { title: p ? `${p.name}: tennis stats and Elo rating` : "Tennis player" };
}

export default function PlayerPage({ params }: PageProps<"/tennis/players/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Player params={params} />
    </Suspense>
  );
}

async function Player({ params }: Pick<PageProps<"/tennis/players/[id]">, "params">) {
  const { id } = await params;
  const [ratings, stats, file] = await Promise.all([getRatings(), getPlayerStats(), getMatches()]);
  const p = ratings.players.find((x) => x.id === id);
  const s = stats.players[id];
  if (!p) notFound();

  const matches = playerMatches(file, id, ratings.scale);
  const history = eloHistory(matches, p.elo);
  const rated = new Map(ratings.players.map((x) => [x.id, x]));
  const form = matches.slice(0, 10).map((m) => (m.won ? "W" : "L")).reverse().join("");

  return (
    <>
      <PageHeader eyebrow={[p.tour, `Elo rank #${p.rank}`, p.country].filter(Boolean).join(" · ")} title={p.name}>
        Rated on {p.n} tour-level singles matches since {ratings.from ? formatDay(ratings.from) : "–"}, last on {formatDay(p.last)}.
        Surfaces are read from the tournament; sets, games and tiebreaks leave out matches that ended in a retirement.
        <div className="mt-3"><Link href="/tennis/ratings" className="text-accent-text hover:underline">← All player ratings</Link></div>
      </PageHeader>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Elo" value={Math.round(p.elo)} sub={p.peak && p.peak_day ? `Peak ${Math.round(p.peak)}, ${shortDate(p.peak_day)}` : `Rank #${p.rank} on the ${p.tour}`} />
          <Stat label="Last 12 months" value={s ? wl(s.year) : "–"} sub={s ? `${pct(wlRate(s.year))} won` : undefined} />
          <Stat label="Streak" value={s?.streak ? streakText(s.streak) : "–"} sub={form ? <FormChips form={form} size="sm" /> : undefined} />
          <Stat
            label="Against the model"
            value={s?.vs_model != null ? `${s.vs_model > 0 ? "+" : ""}${s.vs_model.toFixed(1)}` : "–"}
            sub="Wins over the last year vs its prices"
          />
        </div>

        <Card title="Elo rating" hint="At the end of each month played. Everyone starts at 1500.">
          <EloChart data={history} />
        </Card>

        {s && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="By surface" hint="The whole rated history">
              <Rows>
                {(["hard", "clay", "grass"] as const).map((k) => <Row key={k} label={SURFACE_NAME[k]} v={s.surface[k]} />)}
                <Row label="Grand Slams" v={s.slams} />
                <Row label="All matches" v={s.all} />
              </Rows>
            </Card>
            <Card title="When it's tight" hint="Match record unless noted">
              <Rows>
                <Row label="Tiebreaks" v={s.tiebreaks} note="sets" />
                <Row label="Deciding sets" v={s.deciders} />
                <Row label="After losing the 1st set" v={s.lost_first} />
                <Row label="After winning the 1st set" v={s.won_first} />
                <Row label="Sets" v={s.sets} note="sets" />
                <Row label="Games" v={s.games} note="games" />
              </Rows>
            </Card>
            <Card title="Against the field" hint="Rankings are today's Elo ranks">
              <Rows>
                <Row label="vs the top 10" v={s.top10} />
                <Row label="vs the top 50" v={s.top50} />
                <Row label="As the model's favourite" v={s.favourite} note="last year" />
                <Row label="As the underdog" v={s.underdog} note="last year" />
                <Row label="Wins in straight sets" v={s.straight} note="of wins" />
              </Rows>
              {s.retired > 0 && <p className="mt-3 text-xs text-ink-3">Retired from {s.retired} match{s.retired === 1 ? "" : "es"}.</p>}
            </Card>
          </div>
        )}

        <Card title="Recent matches" hint="The chance is the model's, before the match" flush>
          {matches.length ? <MatchTable rows={matches.slice(0, RECENT)} rated={rated} /> : <div className="p-5"><EmptyState title="No matches" /></div>}
        </Card>

        <Head2Head rows={rivals(matches)} matches={matches} rated={rated} />
      </div>
    </>
  );
}

const wl = ([w, l]: WL) => `${w}–${l}`;
const streakText = (s: string) => `${s.slice(1)} ${s[0] === "W" ? "won" : "lost"}`;

function Rows({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-line">{children}</dl>;
}

function Row({ label, v, note }: { label: string; v: WL; note?: string }) {
  const r = wlRate(v);
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <dt className="min-w-0 truncate text-ink-2">{label}{note && <span className="ml-1 text-xs text-ink-3">({note})</span>}</dt>
        <dd className="shrink-0 tabular">
          <span className="font-semibold">{r == null ? "–" : pct(r)}</span>
          <span className="ml-1.5 text-xs text-ink-3">{v[0].toLocaleString("en-GB")}–{v[1].toLocaleString("en-GB")}</span>
        </dd>
      </div>
      {r != null && <Meter value={r} className="mt-1.5" />}
    </div>
  );
}

type Rated = Map<string, { id: string; rank: number }>;

function Opponent({ id, name, rated }: { id: string; name: string; rated: Rated }) {
  const r = rated.get(id);
  return r ? (
    <Link href={`/tennis/players/${id}`} className="hover:text-accent-text hover:underline">
      {name}
    </Link>
  ) : (
    <span>{name}</span>
  );
}

function MatchTable({ rows, rated }: { rows: ReturnType<typeof playerMatches>; rated: Rated }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular">
        <thead>
          <tr className="border-y border-line text-left text-xs text-ink-3">
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="hidden px-2 py-2 font-medium md:table-cell">Tournament</th>
            <th className="px-2 py-2 font-medium">Opponent</th>
            <th className="px-2 py-2 text-right font-medium">Chance</th>
            <th className="px-2 py-2 font-medium">Score</th>
            <th className="px-4 py-2 text-right font-medium"><span className="sr-only">Result</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              <td className="px-4 py-2 whitespace-nowrap text-ink-3">{shortDate(m.date)}</td>
              <td className="hidden max-w-56 px-2 py-2 md:table-cell">
                <div className="truncate">{m.event}</div>
                <div className="truncate text-xs text-ink-3">{m.round} · {SURFACE_NAME[m.surface]}</div>
              </td>
              <td className="max-w-44 px-2 py-2">
                <div className="truncate font-medium"><Opponent id={m.opponent.id} name={m.opponent.name} rated={rated} /></div>
                <div className="text-xs text-ink-3">Elo {Math.round(m.oppElo)}</div>
              </td>
              <td className="px-2 py-2 text-right"><ProbPill p={m.p} size="sm" /></td>
              <td className="px-2 py-2 font-mono text-xs whitespace-nowrap">
                {m.score}
                {m.retired && <span className="ml-1.5"><Tag tone="warn">ret.</Tag></span>}
              </td>
              <td className="px-4 py-2 text-right"><ResultMark won={m.won} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Head2Head({ rows, matches, rated }: { rows: ReturnType<typeof rivals>; matches: ReturnType<typeof playerMatches>; rated: Rated }) {
  if (!rows.length) return null;
  return (
    <Card title="Head to head" hint="Opponents met more than once. Open one for every meeting." flush>
      <ul className="divide-y divide-line border-t border-line">
        {rows.slice(0, 15).map((r) => {
          const [w, l] = r.record;
          return (
            <li key={r.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-2/50 sm:px-5">
                  <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                  <span className={cx("font-semibold tabular", w > l ? "text-good" : w < l ? "text-bad" : "text-ink-2")}>{w}–{l}</span>
                  <span className="hidden text-xs text-ink-3 sm:inline">last {shortDate(r.last)}</span>
                  <span className="text-ink-3 transition-transform group-open:rotate-90" aria-hidden>›</span>
                </summary>
                <div className="border-t border-line bg-surface-2/30">
                  <MatchTable rows={matches.filter((m) => m.opponent.id === r.id)} rated={rated} />
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

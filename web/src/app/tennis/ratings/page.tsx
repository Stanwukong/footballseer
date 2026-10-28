import type { Metadata } from "next";

import { RatingsTable } from "@/components/tennis/Ratings";
import { PageHeader } from "@/components/ui";
import { formatDay } from "@/lib/format";
import { getRatings } from "@/lib/tennis/data";

export const metadata: Metadata = { title: "Tennis player ratings" };

export default async function RatingsPage() {
  const r = await getRatings();
  return (
    <>
      <PageHeader eyebrow={r.as_of ? `Ratings · ${formatDay(r.as_of)}` : "Ratings"} title="Player ratings">
        Elo ratings from {r.matches.toLocaleString("en-GB")} singles matches since {r.from ? formatDay(r.from) : "–"}. Everyone starts at
        1500; a win takes points from the loser, more for an upset. A 100-point lead makes a player about a {Math.round(100 / (1 + 10 ** (-100 * r.scale / 400)))}%
        favourite over three sets. Players with five or more matches in the last year are listed.
      </PageHeader>
      <RatingsTable players={r.players} />
    </>
  );
}

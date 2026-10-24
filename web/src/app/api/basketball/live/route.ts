import { connection } from "next/server";

import { getLiveFeed } from "@/lib/basketball/live";

/** Today's basketball games in covered leagues: state, clock, score, quarter scores and top scorers. */
export async function GET() {
  await connection();
  try {
    const feed = await getLiveFeed();
    return Response.json(feed, {
      headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" },
    });
  } catch {
    return Response.json({ error: "Live data is unavailable right now." }, { status: 502 });
  }
}

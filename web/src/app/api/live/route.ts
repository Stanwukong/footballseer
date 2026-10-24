import { connection } from "next/server";

import { getLiveFeed } from "@/lib/live";

/** Today's matches in covered leagues with live state, score, incidents and headline stats. */
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

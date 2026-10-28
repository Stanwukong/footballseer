import { connection } from "next/server";

import { getTennisFeed } from "@/lib/tennis/live";

/** Today's tennis: in play, next 36 hours, finished; scores, server, market and model prices. */
export async function GET() {
  await connection();
  try {
    const feed = await getTennisFeed();
    return Response.json(feed, {
      headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" },
    });
  } catch {
    return Response.json({ error: "Live data is unavailable right now." }, { status: 502 });
  }
}

import { connection } from "next/server";

import { getLiveDetail, SLUG_TO_CODE } from "@/lib/live";

/** One match in full: stats box, timeline, line-ups, commentary. */
export async function GET(_req: Request, { params }: RouteContext<"/api/live/[league]/[event]">) {
  await connection();
  const { league, event } = await params;
  if (!SLUG_TO_CODE[league] || !/^\d{1,12}$/.test(event)) {
    return Response.json({ error: "Unknown match." }, { status: 404 });
  }
  try {
    const detail = await getLiveDetail(league, event);
    const done = detail.event.state === "post";
    return Response.json(detail, {
      // Finished matches don't change; cache them longer.
      headers: { "Cache-Control": `public, s-maxage=${done ? 600 : 15}, stale-while-revalidate=${done ? 3600 : 30}` },
    });
  } catch {
    return Response.json({ error: "Live data is unavailable right now." }, { status: 502 });
  }
}

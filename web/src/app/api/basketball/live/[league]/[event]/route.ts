import { connection } from "next/server";

import { getLiveDetail, PREFIX_TO_CODE } from "@/lib/basketball/live";

/** One game in full: team stats, box score, scoring plays. */
export async function GET(_req: Request, { params }: RouteContext<"/api/basketball/live/[league]/[event]">) {
  await connection();
  const { league, event } = await params;
  if (!PREFIX_TO_CODE[league] || !/^[A-Za-z0-9_]{1,24}$/.test(event)) {
    return Response.json({ error: "Unknown game." }, { status: 404 });
  }
  try {
    const detail = await getLiveDetail(league, event);
    const done = detail.event.state === "post";
    return Response.json(detail, {
      // Finished games don't change; cache them longer.
      headers: { "Cache-Control": `public, s-maxage=${done ? 600 : 15}, stale-while-revalidate=${done ? 3600 : 30}` },
    });
  } catch {
    return Response.json({ error: "Live data is unavailable right now." }, { status: 502 });
  }
}

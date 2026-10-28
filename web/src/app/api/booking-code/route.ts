import { connection } from "next/server";

import { CodeError, decodeCode } from "@/lib/booking";
import { COUNTRIES, type Country } from "@/lib/sporty-countries";

/** A SportyBet booking code's selections, each priced by our model: /api/booking-code?code=ABC123&c=ng */
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  const c = (url.searchParams.get("c") ?? "ng").toLowerCase();
  if (!(c in COUNTRIES)) return Response.json({ error: "Unknown SportyBet country." }, { status: 400 });
  try {
    const slip = await decodeCode(code, c as Country);
    return Response.json(slip, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
  } catch (e) {
    if (e instanceof CodeError) return Response.json({ error: e.message }, { status: 404 });
    return Response.json({ error: "SportyBet is unavailable right now. Try again in a minute." }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { joinRoom } from "@/lib/multiplayer/server/rooms";
import { multiplayerFailureResponse } from "@/lib/multiplayer/server/response";
import { multiplayerRateLimitResponse } from "@/lib/multiplayer/server/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = await multiplayerRateLimitResponse(request, "joinRoom");
  if (limited) return limited;

  try {
    let body: { code?: unknown };
    try {
      body = await request.json() as { code?: unknown };
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const room = await joinRoom(body.code);
    return NextResponse.json(room, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return multiplayerFailureResponse(error);
  }
}

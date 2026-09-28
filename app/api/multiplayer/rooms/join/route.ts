import { NextResponse } from "next/server";
import { joinRoom, RoomError } from "@/lib/multiplayer/server/rooms";
import { peerovoErrorReason } from "@/lib/multiplayer/server/peerovo";
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
    const status = error instanceof RoomError ? error.status : 503;
    const reason = error instanceof RoomError ? error.reason : peerovoErrorReason(error);
    return NextResponse.json({ error: reason }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

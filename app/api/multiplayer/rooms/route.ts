import { NextResponse } from "next/server";
import { createRoom, RoomError } from "@/lib/multiplayer/server/rooms";
import { peerovoErrorReason } from "@/lib/multiplayer/server/peerovo";
import { multiplayerRateLimitResponse } from "@/lib/multiplayer/server/rateLimit";

export const runtime = "nodejs";

function failure(error: unknown) {
  const status = error instanceof RoomError ? error.status : 503;
  const reason = error instanceof RoomError ? error.reason : peerovoErrorReason(error);
  return NextResponse.json({ error: reason }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const limited = await multiplayerRateLimitResponse(request, "createRoom");
  if (limited) return limited;

  try {
    let body: { seed?: unknown };
    try {
      body = await request.json() as { seed?: unknown };
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const room = await createRoom(body.seed as number);
    return NextResponse.json(room, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

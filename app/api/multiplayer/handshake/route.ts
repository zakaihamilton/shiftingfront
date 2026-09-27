import { NextResponse } from "next/server";
import { RoomError, validateHandshake } from "@/lib/multiplayer/server/rooms";
import { multiplayerRateLimitResponse } from "@/lib/multiplayer/server/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = await multiplayerRateLimitResponse(request, "handshake");
  if (limited) return limited;

  try {
    const body = await request.json() as { hostGrant: unknown; guestGrant: unknown; guestPeerId: unknown };
    return NextResponse.json(await validateHandshake(body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof RoomError ? error.status : 400;
    const reason = error instanceof RoomError ? error.reason : "invalid_request";
    return NextResponse.json({ error: reason }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

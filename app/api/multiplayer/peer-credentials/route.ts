import { NextResponse } from "next/server";
import { RoomError, refreshPeerCredential } from "@/lib/multiplayer/server/rooms";
import { peerovoErrorReason } from "@/lib/multiplayer/server/peerovo";
import { multiplayerRateLimitResponse } from "@/lib/multiplayer/server/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = await multiplayerRateLimitResponse(request, "peerCredentials");
  if (limited) return limited;

  try {
    const body = await request.json() as { grant?: unknown };
    const credential = await refreshPeerCredential(body.grant);
    return NextResponse.json(credential, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof RoomError ? error.status : 503;
    const reason = error instanceof RoomError ? error.reason : peerovoErrorReason(error);
    return NextResponse.json({ error: reason }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

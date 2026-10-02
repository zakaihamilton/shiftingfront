import { NextResponse } from "next/server";
import { RoomError, validateHandshake } from "@/lib/multiplayer/server/rooms";
import { multiplayerRateLimitResponse } from "@/lib/multiplayer/server/rateLimit";
import { isJsonObject, multiplayerJsonRequestError, readMultiplayerJsonRequest } from "@/lib/multiplayer/server/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = await multiplayerRateLimitResponse(request, "handshake");
  if (limited) return limited;

  try {
    const parsed = await readMultiplayerJsonRequest(request);
    if (!parsed.ok) return multiplayerJsonRequestError(parsed.reason);
    if (!isJsonObject(parsed.value)) return multiplayerJsonRequestError("invalid_request");
    const body = {
      hostGrant: parsed.value.hostGrant,
      guestGrant: parsed.value.guestGrant,
      guestPeerId: parsed.value.guestPeerId,
    };
    return NextResponse.json(await validateHandshake(body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof RoomError ? error.status : 400;
    const reason = error instanceof RoomError ? error.reason : "invalid_request";
    return NextResponse.json({ error: reason }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

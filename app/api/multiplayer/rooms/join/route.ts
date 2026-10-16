import { NextResponse } from "next/server";
import { joinRoom } from "@/lib/multiplayer/server/rooms";
import { multiplayerFailureResponse } from "@/lib/multiplayer/server/response";
import { multiplayerRateLimitResponse } from "@/lib/multiplayer/server/rateLimit";
import { isJsonObject, multiplayerJsonRequestError, readMultiplayerJsonRequest } from "@/lib/multiplayer/server/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = await multiplayerRateLimitResponse(request, "joinRoom");
  if (limited) return limited;

  try {
    const parsed = await readMultiplayerJsonRequest(request);
    if (!parsed.ok) return multiplayerJsonRequestError(parsed.reason);
    if (!isJsonObject(parsed.value)) return multiplayerJsonRequestError("invalid_request");

    const room = await joinRoom(parsed.value.code);
    return NextResponse.json(room, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return multiplayerFailureResponse(error);
  }
}

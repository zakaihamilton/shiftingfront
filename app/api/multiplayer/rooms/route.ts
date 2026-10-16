import { NextResponse } from "next/server";
import { createRoom } from "@/lib/multiplayer/server/rooms";
import { multiplayerFailureResponse } from "@/lib/multiplayer/server/response";
import { multiplayerRateLimitResponse } from "@/lib/multiplayer/server/rateLimit";
import { isJsonObject, multiplayerJsonRequestError, readMultiplayerJsonRequest } from "@/lib/multiplayer/server/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = await multiplayerRateLimitResponse(request, "createRoom");
  if (limited) return limited;

  try {
    const parsed = await readMultiplayerJsonRequest(request);
    if (!parsed.ok) return multiplayerJsonRequestError(parsed.reason);
    if (!isJsonObject(parsed.value)) return multiplayerJsonRequestError("invalid_request");
    const room = await createRoom(parsed.value.seed as number);
    return NextResponse.json(room, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return multiplayerFailureResponse(error);
  }
}

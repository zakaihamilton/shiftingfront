import { NextResponse } from "next/server";
import { refreshPeerCredential } from "@/lib/multiplayer/server/rooms";
import { multiplayerFailureResponse } from "@/lib/multiplayer/server/response";
import { multiplayerRateLimitResponse } from "@/lib/multiplayer/server/rateLimit";
import { isJsonObject, multiplayerJsonRequestError, readMultiplayerJsonRequest } from "@/lib/multiplayer/server/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = await multiplayerRateLimitResponse(request, "peerCredentials");
  if (limited) return limited;

  try {
    const parsed = await readMultiplayerJsonRequest(request);
    if (!parsed.ok) return multiplayerJsonRequestError(parsed.reason);
    if (!isJsonObject(parsed.value)) return multiplayerJsonRequestError("invalid_request");
    const credential = await refreshPeerCredential(parsed.value.grant);
    return NextResponse.json(credential, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return multiplayerFailureResponse(error);
  }
}

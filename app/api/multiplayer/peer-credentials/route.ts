import { NextResponse } from "next/server";
import { refreshPeerCredential } from "@/lib/multiplayer/server/rooms";
import { multiplayerFailureResponse } from "@/lib/multiplayer/server/response";
import { multiplayerRateLimitResponse } from "@/lib/multiplayer/server/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = await multiplayerRateLimitResponse(request, "peerCredentials");
  if (limited) return limited;

  try {
    let body: { grant?: unknown };
    try {
      body = await request.json() as { grant?: unknown };
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const credential = await refreshPeerCredential(body.grant);
    return NextResponse.json(credential, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return multiplayerFailureResponse(error);
  }
}

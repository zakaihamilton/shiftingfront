import { NextResponse } from "next/server";
import { createRoom } from "@/lib/multiplayer/server/rooms";
import { multiplayerFailureResponse } from "@/lib/multiplayer/server/response";
import { multiplayerRateLimitResponse } from "@/lib/multiplayer/server/rateLimit";

export const runtime = "nodejs";

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
    return multiplayerFailureResponse(error);
  }
}

import { NextResponse } from "next/server";
import { peerovoErrorReason } from "./peerovo";
import { RoomError } from "./rooms";

export function multiplayerFailureResponse(error: unknown) {
  const status = error instanceof RoomError ? error.status : 503;
  const reason = error instanceof RoomError ? error.reason : peerovoErrorReason(error);
  return NextResponse.json({ error: reason }, { status, headers: { "Cache-Control": "no-store" } });
}

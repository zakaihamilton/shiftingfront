import { NextResponse } from "next/server";
import { RoomError } from "./rooms";
import { peerovoErrorReason } from "./peerovo";

export function multiplayerFailureResponse(error: unknown) {
  const status = error instanceof RoomError ? error.status : 503;
  const reason = error instanceof RoomError ? error.reason : peerovoErrorReason(error);
  return NextResponse.json({ error: reason }, { status, headers: { "Cache-Control": "no-store" } });
}

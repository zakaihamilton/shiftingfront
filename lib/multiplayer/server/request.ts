import { NextResponse } from "next/server";

export const MAX_MULTIPLAYER_REQUEST_BODY_BYTES = 8 * 1024;

export type JsonRequestError = "invalid_request" | "request_too_large";
export type JsonRequestResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: JsonRequestError };

/** Read a small JSON body without buffering an attacker-controlled payload in full. */
export async function readMultiplayerJsonRequest(request: Request): Promise<JsonRequestResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) return { ok: false, reason: "invalid_request" };
    if (Number(contentLength) > MAX_MULTIPLAYER_REQUEST_BODY_BYTES) {
      await request.body?.cancel().catch(() => undefined);
      return { ok: false, reason: "request_too_large" };
    }
  }

  if (!request.body) return { ok: false, reason: "invalid_request" };

  const reader = request.body.getReader();
  const bytes = new Uint8Array(MAX_MULTIPLAYER_REQUEST_BODY_BYTES);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.byteLength > MAX_MULTIPLAYER_REQUEST_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "request_too_large" };
      }
      bytes.set(value, length);
      length += value.byteLength;
    }

    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length));
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: "invalid_request" };
  } finally {
    reader.releaseLock();
  }
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function multiplayerJsonRequestError(reason: JsonRequestError): NextResponse {
  return NextResponse.json(
    { error: reason },
    {
      status: reason === "request_too_large" ? 413 : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

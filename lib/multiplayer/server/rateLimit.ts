import { checkRateLimit } from "@vercel/firewall";
import { NextResponse } from "next/server";

export const MULTIPLAYER_RATE_LIMITS = {
  createRoom: { id: "shiftingfront-multiplayer-room-create", retryAfterSeconds: 600 },
  joinRoom: { id: "shiftingfront-multiplayer-room-join", retryAfterSeconds: 60 },
  handshake: { id: "shiftingfront-multiplayer-handshake", retryAfterSeconds: 60 },
  peerCredentials: { id: "shiftingfront-multiplayer-peer-credentials", retryAfterSeconds: 60 },
} as const;

export type MultiplayerRateLimitKey = keyof typeof MULTIPLAYER_RATE_LIMITS;
export type MultiplayerRateLimitRuntime = {
  production: boolean;
  vercel: boolean;
  externalLimiterConfigured: boolean;
};
export type MultiplayerRateLimitOutcome = "allowed" | "limited" | "unavailable";

function runtimeFromEnvironment(): MultiplayerRateLimitRuntime {
  return {
    production: process.env.NODE_ENV === "production",
    vercel: process.env.VERCEL === "1",
    externalLimiterConfigured: process.env.MULTIPLAYER_EDGE_RATE_LIMIT_CONFIGURED === "true",
  };
}

function isLoopbackRequest(request: Request): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Uses shared edge counters in production while allowing non-Vercel loopback requests for local runs. */
export async function checkMultiplayerRateLimit(
  request: Request,
  key: MultiplayerRateLimitKey,
  runtime = runtimeFromEnvironment(),
  check: typeof checkRateLimit = checkRateLimit,
): Promise<MultiplayerRateLimitOutcome> {
  if (!runtime.production) return "allowed";
  if (!runtime.vercel && isLoopbackRequest(request)) return "allowed";
  if (!runtime.vercel) return runtime.externalLimiterConfigured ? "allowed" : "unavailable";

  try {
    const result = await check(MULTIPLAYER_RATE_LIMITS[key].id, { request });
    if (result.error === "not-found") return "unavailable";
    if (result.rateLimited) return "limited";
    if (result.error) return "unavailable";
    return "allowed";
  } catch {
    return "unavailable";
  }
}

export async function multiplayerRateLimitResponse(
  request: Request,
  key: MultiplayerRateLimitKey,
): Promise<NextResponse | null> {
  const outcome = await checkMultiplayerRateLimit(request, key);
  if (outcome === "unavailable") {
    return NextResponse.json(
      { error: "rate_limit_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (outcome === "limited") {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(MULTIPLAYER_RATE_LIMITS[key].retryAfterSeconds),
        },
      },
    );
  }
  return null;
}

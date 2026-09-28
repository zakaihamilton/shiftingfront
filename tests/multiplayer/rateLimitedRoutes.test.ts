import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createRoom } from "@/app/api/multiplayer/rooms/route";
import { POST as joinRoom } from "@/app/api/multiplayer/rooms/join/route";
import { POST as handshake } from "@/app/api/multiplayer/handshake/route";
import { POST as peerCredentials } from "@/app/api/multiplayer/peer-credentials/route";
import { MULTIPLAYER_RATE_LIMITS } from "@/lib/multiplayer/server/rateLimit";

const { checkRateLimitMock } = vi.hoisted(() => ({ checkRateLimitMock: vi.fn() }));
vi.mock("@vercel/firewall", () => ({ checkRateLimit: checkRateLimitMock }));

const envKeys = ["NODE_ENV", "VERCEL", "MULTIPLAYER_EDGE_RATE_LIMIT_CONFIGURED"] as const;
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]])) as Record<typeof envKeys[number], string | undefined>;

beforeEach(() => {
  Reflect.set(process.env, "NODE_ENV", "production");
  Reflect.set(process.env, "VERCEL", "1");
  Reflect.deleteProperty(process.env, "MULTIPLAYER_EDGE_RATE_LIMIT_CONFIGURED");
  checkRateLimitMock.mockReset().mockResolvedValue({ rateLimited: true });
});

afterEach(() => {
  for (const key of envKeys) {
    const value = savedEnv[key];
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else Reflect.set(process.env, key, value);
  }
  vi.restoreAllMocks();
});

describe("multiplayer route rate-limit gates", () => {
  it("limits every documented endpoint before parsing the request or calling Peerovo", async () => {
    const endpoints = [
      { key: "createRoom", handler: createRoom, path: "/api/multiplayer/rooms" },
      { key: "joinRoom", handler: joinRoom, path: "/api/multiplayer/rooms/join" },
      { key: "handshake", handler: handshake, path: "/api/multiplayer/handshake" },
      { key: "peerCredentials", handler: peerCredentials, path: "/api/multiplayer/peer-credentials" },
    ] as const;

    for (const endpoint of endpoints) {
      checkRateLimitMock.mockClear();
      const request = new Request(`https://shiftingfront.test${endpoint.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });

      const response = await endpoint.handler(request);
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe(String(MULTIPLAYER_RATE_LIMITS[endpoint.key].retryAfterSeconds));
      expect(await response.json()).toEqual({ error: "rate_limited" });
      expect(checkRateLimitMock).toHaveBeenCalledWith(MULTIPLAYER_RATE_LIMITS[endpoint.key].id, { request });
      expect(checkRateLimitMock).toHaveBeenCalledTimes(1);
    }
  });

  it("fails closed when a documented Firewall rule is missing", async () => {
    checkRateLimitMock.mockResolvedValue({ rateLimited: false, error: "not-found" });
    const response = await peerCredentials(new Request("https://shiftingfront.test/api/multiplayer/peer-credentials", {
      method: "POST",
      body: "not-json",
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "rate_limit_unavailable" });
  });
});

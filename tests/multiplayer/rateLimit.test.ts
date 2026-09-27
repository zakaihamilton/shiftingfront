import { describe, expect, it, vi } from "vitest";
import type { checkRateLimit } from "@vercel/firewall";
import {
  checkMultiplayerRateLimit,
  MULTIPLAYER_RATE_LIMITS,
  type MultiplayerRateLimitRuntime,
} from "@/lib/multiplayer/server/rateLimit";

const request = new Request("https://shiftingfront.test/api/multiplayer/rooms/join", { method: "POST" });
const vercelProduction: MultiplayerRateLimitRuntime = {
  production: true,
  vercel: true,
  externalLimiterConfigured: false,
};

describe("multiplayer shared rate limits", () => {
  it("uses a separate configured Firewall bucket for each public multiplayer endpoint", async () => {
    for (const key of Object.keys(MULTIPLAYER_RATE_LIMITS) as Array<keyof typeof MULTIPLAYER_RATE_LIMITS>) {
      const check = vi.fn<typeof checkRateLimit>().mockResolvedValue({ rateLimited: false });

      await expect(checkMultiplayerRateLimit(request, key, vercelProduction, check)).resolves.toBe("allowed");
      expect(check).toHaveBeenCalledWith(MULTIPLAYER_RATE_LIMITS[key].id, { request });
    }
  });

  it("rejects rate-limited requests, including Firewall blocked responses", async () => {
    const check = vi.fn<typeof checkRateLimit>().mockResolvedValue({ rateLimited: true, error: "blocked" });
    await expect(checkMultiplayerRateLimit(request, "peerCredentials", vercelProduction, check)).resolves.toBe("limited");
  });

  it("fails closed when a Firewall rule is missing or the check fails", async () => {
    const missingRule = vi.fn<typeof checkRateLimit>().mockResolvedValue({ rateLimited: false, error: "not-found" });
    const failedCheck = vi.fn<typeof checkRateLimit>().mockRejectedValue(new Error("Firewall unavailable"));

    await expect(checkMultiplayerRateLimit(request, "createRoom", vercelProduction, missingRule)).resolves.toBe("unavailable");
    await expect(checkMultiplayerRateLimit(request, "handshake", vercelProduction, failedCheck)).resolves.toBe("unavailable");
  });

  it("does not use local counters and requires an external edge limiter outside Vercel production", async () => {
    const check = vi.fn<typeof checkRateLimit>();

    await expect(checkMultiplayerRateLimit(request, "joinRoom", {
      production: true,
      vercel: false,
      externalLimiterConfigured: false,
    }, check)).resolves.toBe("unavailable");
    await expect(checkMultiplayerRateLimit(request, "peerCredentials", {
      production: true,
      vercel: false,
      externalLimiterConfigured: true,
    }, check)).resolves.toBe("allowed");
    await expect(checkMultiplayerRateLimit(request, "createRoom", {
      production: false,
      vercel: false,
      externalLimiterConfigured: false,
    }, check)).resolves.toBe("allowed");
    expect(check).not.toHaveBeenCalled();
  });
});

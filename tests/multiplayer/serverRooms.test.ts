import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRoom,
  deriveRoomSessionId,
  joinRoom,
  ROOM_LIFETIME_MS,
  signRoomGrant,
  validateHandshake,
  verifyRoomGrant,
  RoomError,
} from "@/lib/multiplayer/server/rooms";
import { fetchPeerJsSettings, getPeerovoSettings, issuePeerCredential, PeerovoError } from "@/lib/multiplayer/server/peerovo";
import { POST as createRoomRoute } from "@/app/api/multiplayer/rooms/route";
import { POST as joinRoomRoute } from "@/app/api/multiplayer/rooms/join/route";
import { POST as peerCredentialsRoute } from "@/app/api/multiplayer/peer-credentials/route";

const envKeys = [
  "PEEROVO_API_URL",
  "PEEROVO_PROJECT_ID",
  "PEEROVO_PROJECT_API_KEY",
  "MULTIPLAYER_ROOM_SIGNING_SECRET",
] as const;
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]])) as Record<typeof envKeys[number], string | undefined>;
const savedFetch = globalThis.fetch;

function peerovoFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/config") {
      return Response.json({
        signalingAuthMode: "project-session-peerovo-v1",
        peerJs: { host: "signal.example.test", port: 443, path: "/", key: "peerjs", secure: true },
      });
    }
    if (url.pathname.endsWith("/ice-config")) {
      return Response.json({ iceServers: [{ urls: "turn:turn.example.test" }] });
    }

    const body = JSON.parse(String(init?.body)) as { peerId: string; expiresInSeconds: number };
    const route = url.pathname.split("/");
    const sessionId = route[route.indexOf("sessions") + 1]!;
    const projectId = route[route.indexOf("projects") + 1]!;
    return new Response(JSON.stringify({
      projectId,
      sessionId,
      peerId: body.peerId,
      peerToken: `peer-token-${body.peerId}`,
      expiresAt: Math.floor(Date.now() / 1000) + body.expiresInSeconds,
    }), { status: 201 });
  });
}

beforeEach(() => {
  process.env.PEEROVO_API_URL = "https://peerovo.example.test";
  process.env.PEEROVO_PROJECT_ID = "shiftingfront";
  process.env.PEEROVO_PROJECT_API_KEY = "test-peerovo-project-api-key-with-32-bytes";
  process.env.MULTIPLAYER_ROOM_SIGNING_SECRET = "test-multiplayer-room-secret-at-least-32-bytes";
  globalThis.fetch = peerovoFetch() as typeof fetch;
});

afterEach(() => {
  for (const key of envKeys) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = savedFetch;
  vi.restoreAllMocks();
});

describe("stateless multiplayer room credentials", () => {
  it("creates a random six-letter code and a signed host grant carrying the seed", async () => {
    const created = await createRoom(4712);
    const grant = verifyRoomGrant(created.grant);

    expect(created.code).toMatch(/^[A-HJ-NP-Z]{6}$/);
    expect(created).toMatchObject({
      seed: 4712,
      hostPeerId: `sfh-${deriveRoomSessionId(created.code)}`,
      peerId: `sfh-${deriveRoomSessionId(created.code)}`,
      peerToken: expect.stringMatching(/^peer-token-/),
      iceServers: [{ urls: "turn:turn.example.test" }],
    });
    expect(grant).toMatchObject({ code: created.code, role: "host", seed: 4712, peerId: created.hostPeerId });
    expect(grant!.expiresAt - grant!.issuedAt).toBe(ROOM_LIFETIME_MS);
    expect(JSON.stringify(created)).not.toContain(process.env.PEEROVO_PROJECT_API_KEY);
  });

  it("resolves codes case-insensitively with deterministic room and host identities", async () => {
    const host = await createRoom(73);
    const guest = await joinRoom(host.code.toLowerCase());
    const guestGrant = verifyRoomGrant(guest.grant);

    expect(guest.code).toBe(host.code);
    expect(guest.hostPeerId).toBe(host.hostPeerId);
    expect(guest.peerId).toMatch(/^sfg-[a-f0-9]{32}$/);
    expect(guest.peerId).not.toBe(host.peerId);
    expect(guest).not.toHaveProperty("seed");
    expect(guestGrant).toMatchObject({ code: host.code, sessionId: verifyRoomGrant(host.grant)!.sessionId, role: "guest", peerId: guest.peerId });

    await expect(validateHandshake({ hostGrant: host.grant, guestGrant: guest.grant, guestPeerId: guest.peerId }))
      .resolves.toEqual({ valid: true, seed: 73 });
    await expect(validateHandshake({ hostGrant: host.grant, guestGrant: guest.grant, guestPeerId: "another-peer" }))
      .rejects.toThrowError(new RoomError("invalid_handshake", 403));
  });

  it("keeps no room registry: valid code resolution only derives signed peer identities", async () => {
    const first = await joinRoom("ABCDEF");
    const second = await joinRoom("abcdef");

    expect(first.hostPeerId).toBe(second.hostPeerId);
    expect(first.peerId).not.toBe(second.peerId);
    expect(verifyRoomGrant(first.grant)?.sessionId).toBe(deriveRoomSessionId("ABCDEF"));
    expect(vi.mocked(globalThis.fetch).mock.calls.every(([input]) => String(input).startsWith("https://peerovo.example.test/"))).toBe(true);
  });

  it("rejects malformed codes and invalid seeds before calling Peerovo", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    await expect(joinRoom("abc123")).rejects.toMatchObject({ reason: "invalid_code", status: 400 });
    await expect(createRoom(10_000)).rejects.toMatchObject({ reason: "invalid_seed", status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects altered, expired, and cross-room grants", async () => {
    const host = await createRoom(42);
    const guest = await joinRoom("ZZZZZZ");
    const signedHost = verifyRoomGrant(host.grant)!;
    const expired = signRoomGrant({ ...signedHost, issuedAt: Date.now() - ROOM_LIFETIME_MS - 1, expiresAt: Date.now() - 1 });
    const [payload, signature] = host.grant.split(".");

    expect(verifyRoomGrant(`${payload}x.${signature}`)).toBeNull();
    expect(verifyRoomGrant(expired)).toBeNull();
    await expect(validateHandshake({ hostGrant: host.grant, guestGrant: guest.grant, guestPeerId: guest.peerId }))
      .rejects.toMatchObject({ reason: "invalid_handshake", status: 403 });
  });

  it("fails closed when the room signing secret is absent", async () => {
    delete process.env.MULTIPLAYER_ROOM_SIGNING_SECRET;
    await expect(createRoom(42)).rejects.toMatchObject({ reason: "server_not_configured", status: 503 });
    await expect(joinRoom("ABCDEF")).rejects.toMatchObject({ reason: "server_not_configured", status: 503 });
  });

  it("refreshes a peer token using only its verified grant scope", async () => {
    const host = await createRoom(42);
    const settings = getPeerovoSettings();
    expect(settings?.projectApiKey).toBe(process.env.PEEROVO_PROJECT_API_KEY);

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    const peerIssue = calls.find(([input]) => String(input).endsWith("/peers"));
    expect(peerIssue?.[1]?.headers).toMatchObject({ Authorization: `Bearer ${process.env.PEEROVO_PROJECT_API_KEY}` });
    expect(JSON.parse(String(peerIssue?.[1]?.body))).toMatchObject({ peerId: host.peerId, expiresInSeconds: 600 });
    const iceCall = calls.find(([input]) => String(input).endsWith("/ice-config"));
    expect(iceCall?.[1]?.headers).toMatchObject({ Authorization: `Bearer peer-token-${host.peerId}` });
  });

  it("rejects malformed Peerovo configuration and ticket responses", async () => {
    globalThis.fetch = vi.fn(async () => Response.json({ signalingAuthMode: "wrong", peerJs: {} })) as typeof fetch;
    await expect(fetchPeerJsSettings()).rejects.toBeInstanceOf(PeerovoError);

    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/v1/config")) {
        return Response.json({ signalingAuthMode: "project-session-peerovo-v1", peerJs: { host: "signal.example.test", port: 443, path: "/", key: "peerjs", secure: true } });
      }
      return new Response(JSON.stringify({ projectId: "other-project", sessionId: "session-1", peerId: "peer-1", peerToken: "token", expiresAt: now + 500 }), { status: 201 });
    }) as typeof fetch;
    await expect(issuePeerCredential({ sessionId: "session-1", peerId: "peer-1", sessionExpiresAt: Date.now() + 900_000 }))
      .rejects.toMatchObject({ reason: "invalid_ticket_response" });
  });

  it("accepts the join code only in the JSON body and keeps the project key out of responses", async () => {
    const createdResponse = await createRoomRoute(new Request("https://shiftingfront.test/api/multiplayer/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed: 421 }),
    }));
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { code: string };
    expect(created.code).toMatch(/^[A-HJ-NP-Z]{6}$/);

    const beforeJoin = vi.mocked(globalThis.fetch).mock.calls.length;
    const joinedResponse = await joinRoomRoute(new Request("https://shiftingfront.test/api/multiplayer/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: created.code.toLowerCase() }),
    }));
    expect(joinedResponse.status).toBe(200);
    const joined = await joinedResponse.json() as Record<string, unknown>;
    expect(joined.code).toBe(created.code);
    expect(JSON.stringify(joined)).not.toContain(process.env.PEEROVO_PROJECT_API_KEY);
    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBeGreaterThan(beforeJoin);

    const malformed = await joinRoomRoute(new Request("https://shiftingfront.test/api/multiplayer/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    }));
    expect(malformed.status).toBe(400);

    const malformedCredentials = await peerCredentialsRoute(new Request("https://shiftingfront.test/api/multiplayer/peer-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    }));
    expect(malformedCredentials.status).toBe(400);
    expect(await malformedCredentials.json()).toEqual({ error: "invalid_request" });
  });
});

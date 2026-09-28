import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { fetchPeerJsSettings, issuePeerCredential, type PeerJsSettings } from "./peerovo";

export const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ROOM_LIFETIME_MS = 60 * 60 * 1000;
const CODE_RE = /^[A-HJ-NP-Z]{6}$/;
const RESOURCE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const NONCE_RE = /^[a-f0-9]{32}$/;

export type RoomRole = "host" | "guest";
export type RoomGrant = {
  code: string;
  sessionId: string;
  peerId: string;
  role: RoomRole;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  seed?: number;
};

export class RoomError extends Error {
  constructor(readonly reason: string, readonly status: number) {
    super(reason);
    this.name = "RoomError";
  }
}

function signingSecret(): string | null {
  const secret = process.env.MULTIPLAYER_ROOM_SIGNING_SECRET;
  return typeof secret === "string" && Buffer.byteLength(secret) >= 32 ? secret : null;
}

export function validRoomCode(value: unknown): value is string {
  return typeof value === "string" && CODE_RE.test(value.toUpperCase());
}

function normalizedCode(value: unknown): string | null {
  return validRoomCode(value) ? value.toUpperCase() : null;
}

/** Match HostPresent's stateless room identity pattern: derive the Peerovo session from the bearer code. */
export function deriveRoomSessionId(codeValue: unknown): string | null {
  const secret = signingSecret();
  const code = normalizedCode(codeValue);
  if (!secret || !code) return null;

  const bytes = Buffer.from(createHmac("sha256", secret)
    .update("shiftingfront:room-session:")
    .update(code)
    .digest()
    .subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function hostPeerId(sessionId: string): string {
  return `sfh-${sessionId}`;
}

function guestPeerId(sessionId: string, nonce: string): string | null {
  const secret = signingSecret();
  if (!secret || !RESOURCE_ID_RE.test(sessionId) || !NONCE_RE.test(nonce)) return null;
  const digest = createHmac("sha256", secret)
    .update("shiftingfront:guest-peer:")
    .update(sessionId)
    .update(":")
    .update(nonce)
    .digest("hex");
  return `sfg-${digest.slice(0, 32)}`;
}

function makeCode(): string {
  let code = "";
  for (let index = 0; index < 6; index += 1) code += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)];
  return code;
}

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export function signRoomGrant(grant: RoomGrant): string {
  const secret = signingSecret();
  if (!secret) throw new RoomError("server_not_configured", 503);
  const payload = encodeBase64Url(JSON.stringify(grant));
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function isRoomGrant(value: unknown): value is RoomGrant {
  if (!value || typeof value !== "object") return false;
  const grant = value as Partial<RoomGrant>;
  if (!validRoomCode(grant.code) || grant.code !== grant.code.toUpperCase() ||
      typeof grant.sessionId !== "string" || !RESOURCE_ID_RE.test(grant.sessionId) ||
      grant.sessionId !== deriveRoomSessionId(grant.code) ||
      typeof grant.peerId !== "string" || !RESOURCE_ID_RE.test(grant.peerId) ||
      (grant.role !== "host" && grant.role !== "guest") ||
      !Number.isSafeInteger(grant.issuedAt) || !Number.isSafeInteger(grant.expiresAt) ||
      Number(grant.expiresAt) <= Number(grant.issuedAt) ||
      Number(grant.expiresAt) - Number(grant.issuedAt) > ROOM_LIFETIME_MS ||
      Number(grant.issuedAt) > Date.now() + 60_000 || Number(grant.expiresAt) <= Date.now() ||
      typeof grant.nonce !== "string" || !NONCE_RE.test(grant.nonce)) return false;

  if (grant.role === "host") {
    return grant.peerId === hostPeerId(grant.sessionId) &&
      Number.isInteger(grant.seed) && Number(grant.seed) >= 0 && Number(grant.seed) <= 9999;
  }
  return grant.peerId === guestPeerId(grant.sessionId, grant.nonce) && grant.seed === undefined;
}

export function verifyRoomGrant(value: unknown): RoomGrant | null {
  const secret = signingSecret();
  if (!secret || typeof value !== "string" || value.length > 2048) return null;
  const parts = value.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]!) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1]!)) return null;
  const [payload, signature] = parts as [string, string];
  const expected = createHmac("sha256", secret).update(payload).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return isRoomGrant(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function credentials(grant: RoomGrant) {
  const peerJs: PeerJsSettings = await fetchPeerJsSettings();
  const credential = await issuePeerCredential({
    sessionId: grant.sessionId,
    peerId: grant.peerId,
    sessionExpiresAt: grant.expiresAt,
  });
  return {
    peerId: grant.peerId,
    peerJs,
    peerToken: credential.peerToken,
    peerExpiresAt: credential.expiresAt,
    iceServers: credential.iceServers,
  };
}

export async function createRoom(seed: number) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 9999) throw new RoomError("invalid_seed", 400);
  if (!signingSecret()) throw new RoomError("server_not_configured", 503);

  const code = makeCode();
  const sessionId = deriveRoomSessionId(code);
  if (!sessionId) throw new RoomError("server_not_configured", 503);
  const issuedAt = Date.now();
  const grant: RoomGrant = {
    code,
    sessionId,
    peerId: hostPeerId(sessionId),
    role: "host",
    issuedAt,
    expiresAt: issuedAt + ROOM_LIFETIME_MS,
    nonce: randomBytes(16).toString("hex"),
    seed,
  };
  const signedGrant = signRoomGrant(grant);
  return {
    code,
    seed,
    hostPeerId: grant.peerId,
    grant: signedGrant,
    expiresAt: grant.expiresAt,
    ...(await credentials(grant)),
  };
}

export async function joinRoom(codeValue: unknown) {
  const code = normalizedCode(codeValue);
  if (!code) throw new RoomError("invalid_code", 400);
  const sessionId = deriveRoomSessionId(code);
  if (!sessionId) throw new RoomError("server_not_configured", 503);

  const issuedAt = Date.now();
  const nonce = randomBytes(16).toString("hex");
  const peerId = guestPeerId(sessionId, nonce);
  if (!peerId) throw new RoomError("server_not_configured", 503);
  const grant: RoomGrant = {
    code,
    sessionId,
    peerId,
    role: "guest",
    issuedAt,
    expiresAt: issuedAt + ROOM_LIFETIME_MS,
    nonce,
  };
  const signedGrant = signRoomGrant(grant);
  return {
    code,
    hostPeerId: hostPeerId(sessionId),
    grant: signedGrant,
    expiresAt: grant.expiresAt,
    ...(await credentials(grant)),
  };
}

export async function validateHandshake(input: { hostGrant: unknown; guestGrant: unknown; guestPeerId: unknown }) {
  const host = verifyRoomGrant(input.hostGrant);
  const guest = verifyRoomGrant(input.guestGrant);
  if (!host || !guest || host.role !== "host" || guest.role !== "guest" ||
      host.code !== guest.code || host.sessionId !== guest.sessionId ||
      guest.peerId !== input.guestPeerId || host.peerId !== hostPeerId(host.sessionId)) {
    throw new RoomError("invalid_handshake", 403);
  }
  return { valid: true as const, seed: host.seed! };
}

export async function refreshPeerCredential(grantValue: unknown) {
  const grant = verifyRoomGrant(grantValue);
  if (!grant) throw new RoomError("invalid_grant", 403);
  return credentials(grant);
}

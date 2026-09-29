
const API_TIMEOUT_MS = 10_000;
const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const TOKEN_LIFETIME_SECONDS = 600;

export type PeerJsSettings = {
  host: string;
  port: number;
  path: string;
  key: string;
  secure: boolean;
};

type PeerovoSettings = {
  apiUrl: string;
  projectId: string;
  projectApiKey: string;
};

export class PeerovoError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "PeerovoError";
  }
}

export function getPeerovoSettings(env: NodeJS.ProcessEnv = process.env): PeerovoSettings | null {
  const rawApiUrl = env.PEEROVO_API_URL?.trim();
  const projectId = env.PEEROVO_PROJECT_ID?.trim();
  const projectApiKey = env.PEEROVO_PROJECT_API_KEY;
  if (!rawApiUrl || !projectId || !PROJECT_ID.test(projectId) || !projectApiKey ||
      Buffer.byteLength(projectApiKey) < 32 || projectApiKey.trim() !== projectApiKey) return null;

  let apiUrl: URL;
  try { apiUrl = new URL(rawApiUrl); } catch { return null; }
  const localHttp = apiUrl.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(apiUrl.hostname.toLowerCase());
  if (!["https:", "http:"].includes(apiUrl.protocol) || (apiUrl.protocol !== "https:" && (env.NODE_ENV === "production" || !localHttp)) ||
      apiUrl.username || apiUrl.password || apiUrl.pathname !== "/" || apiUrl.search || apiUrl.hash) return null;
  return { apiUrl: apiUrl.origin, projectId, projectApiKey };
}

function endpoint(settings: PeerovoSettings, path: string): string {
  return new URL(path, `${settings.apiUrl}/`).toString();
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: abort.signal });
  } catch {
    throw new PeerovoError("request_failed");
  } finally {
    clearTimeout(timer);
  }
}

async function json(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new PeerovoError("invalid_response"); }
}

function validPeerJs(value: unknown): value is PeerJsSettings {
  if (!value || typeof value !== "object") return false;
  const config = value as Record<string, unknown>;
  return typeof config.host === "string" && config.host.length > 0 && !config.host.includes("/") &&
    Number.isInteger(config.port) && Number(config.port) > 0 && Number(config.port) <= 65_535 &&
    typeof config.path === "string" && config.path.startsWith("/") && typeof config.key === "string" &&
    config.key.length > 0 && typeof config.secure === "boolean";
}

export async function fetchPeerJsSettings(): Promise<PeerJsSettings> {
  const settings = getPeerovoSettings();
  if (!settings) throw new PeerovoError("unconfigured");
  const response = await request(endpoint(settings, "/v1/config"));
  if (!response.ok) throw new PeerovoError("config_unavailable");
  const payload = await json(response) as { signalingAuthMode?: unknown; peerJs?: unknown };
  if (payload.signalingAuthMode !== "project-session-peerovo-v1" || !validPeerJs(payload.peerJs)) {
    throw new PeerovoError("invalid_config");
  }
  return payload.peerJs;
}

export async function issuePeerCredential(input: {
  sessionId: string;
  peerId: string;
  sessionExpiresAt: number;
}): Promise<{ peerToken: string; expiresAt: number; iceServers: unknown[] }> {
  const settings = getPeerovoSettings();
  if (!settings) throw new PeerovoError("unconfigured");
  if (!RESOURCE_ID.test(input.sessionId) || !RESOURCE_ID.test(input.peerId) || !Number.isFinite(input.sessionExpiresAt)) {
    throw new PeerovoError("invalid_ticket_request");
  }
  const requestedAtMs = Date.now();
  const expiresInSeconds = Math.min(TOKEN_LIFETIME_SECONDS, Math.floor((input.sessionExpiresAt - requestedAtMs - 15_000) / 1000));
  if (expiresInSeconds < 1) throw new PeerovoError("session_near_expiry");

  const path = `/v1/projects/${encodeURIComponent(settings.projectId)}/sessions/${encodeURIComponent(input.sessionId)}/peers`;
  const response = await request(endpoint(settings, path), {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.projectApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ peerId: input.peerId, expiresInSeconds }),
  });
  const responseReceivedAtMs = Date.now();
  if (response.status !== 201) throw new PeerovoError("ticket_unavailable");
  const payload = await json(response) as Record<string, unknown>;
  const nowSeconds = Math.floor(Date.now() / 1000);
  // Capture the response time before reading its body so a slow stream cannot
  // extend the accepted credential lifetime. Allow a small clock-boundary skew.
  const latestAllowedExpiry = Math.floor(responseReceivedAtMs / 1000) + expiresInSeconds + 5;
  if (payload.projectId !== settings.projectId || payload.sessionId !== input.sessionId || payload.peerId !== input.peerId ||
      typeof payload.peerToken !== "string" || payload.peerToken.length === 0 || payload.peerToken.length > 2048 ||
      !Number.isInteger(payload.expiresAt) || Number(payload.expiresAt) <= nowSeconds ||
      Number(payload.expiresAt) > latestAllowedExpiry ||
      Number(payload.expiresAt) > Math.floor(input.sessionExpiresAt / 1000)) {
    throw new PeerovoError("invalid_ticket_response");
  }

  const icePath = `/v1/projects/${encodeURIComponent(settings.projectId)}/sessions/${encodeURIComponent(input.sessionId)}/peers/${encodeURIComponent(input.peerId)}/ice-config`;
  const iceResponse = await request(endpoint(settings, icePath), { headers: { Authorization: `Bearer ${payload.peerToken}` } });
  if (!iceResponse.ok) throw new PeerovoError("ice_config_unavailable");
  const icePayload = await json(iceResponse) as { iceServers?: unknown };
  if (!Array.isArray(icePayload.iceServers)) throw new PeerovoError("invalid_ice_config");
  return { peerToken: payload.peerToken, expiresAt: Number(payload.expiresAt), iceServers: icePayload.iceServers };
}

export function peerovoErrorReason(error: unknown): string {
  return error instanceof PeerovoError ? error.reason : "peerovo_unavailable";
}

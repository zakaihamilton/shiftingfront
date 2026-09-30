import type { Owner } from "@/lib/types";
import type { Credential } from "./types";

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify(body),
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "multiplayer_unavailable");
  return payload;
}

export function peerOptions(credential: Credential) {
  return {
    ...credential.peerJs,
    token: credential.peerToken,
    config: { iceServers: credential.iceServers },
    debug: 0 as const,
  };
}

export function publicError(error: unknown): string {
  if (error instanceof Error && error.message === "incompatible_build") return "Game versions differ. Reload or update both players before joining.";
  const reason = error instanceof Error ? error.message : "multiplayer_unavailable";
  const messages: Record<string, string> = {
    invalid_code: "Enter a six-letter room code.",
    room_full: "That room is full or has already started.",
    server_not_configured: "Online play is not configured on this server yet.",
    rate_limit_unavailable: "Online room creation is not configured on this server yet.",
    unconfigured: "Online play is not configured on this server yet.",
    project_access_denied: "The multiplayer service rejected this server's project credentials. Check its Peerovo project ID and API key.",
    invalid_handshake: "The room handshake could not be verified.",
    peerovo_unavailable: "Could not get a secure connection. Try again in a moment.",
    ticket_unavailable: "Could not get a secure connection. Try again in a moment.",
  };
  if (reason.includes("peer-unavailable")) return "No host is online for that code. Check it and try again.";
  return messages[reason] ?? "Could not connect to the room. Check your network and try again.";
}

export function PeerFactory() {
  if (process.env.NEXT_PUBLIC_E2E_MULTIPLAYER === "1" && typeof window !== "undefined" && window.__SHIFTFRONT_PEER_FACTORY__) {
    return Promise.resolve(window.__SHIFTFRONT_PEER_FACTORY__());
  }
  return import("peerjs").then(({ Peer: PeerConstructor }) => PeerConstructor);
}

export function validOwners(value: unknown, localOwner: Owner): value is Owner[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 4 &&
    value.every((owner) => owner === 0 || owner === 1 || owner === 2 || owner === 3) &&
    value.includes(0) && value.includes(localOwner) && new Set(value).size === value.length;
}

export function validAiOwners(value: unknown, owners: readonly Owner[], localHumanOwner: unknown): value is Owner[] {
  return Array.isArray(value) && new Set(value).size === value.length &&
    value.every((owner) => (owner === 1 || owner === 2 || owner === 3) && owner !== localHumanOwner && owners.includes(owner));
}

export function ownerLabel(owner: Owner): string {
  return ["Northwest · Host", "Northeast", "Southeast", "Southwest"][owner] ?? `Player ${owner + 1}`;
}

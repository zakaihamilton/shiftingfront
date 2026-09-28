"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { DataConnection, Peer } from "peerjs";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { useModalFocus } from "@/components/ui/useModalFocus";
import type { Owner } from "@/lib/types";
import { MultiplayerSession, SKIRMISH_MATCH_SETTINGS, validSkirmishMatchSettings } from "@/lib/multiplayer/session";
import { rollSeed } from "@/components/menu/menuLaunch";
import styles from "./MultiplayerLobby.module.css";

const DynamicGameClient = dynamic(() => import("@/components/game/GameClient").then((module) => module.GameClient), {
  ssr: false,
  loading: () => <main className={styles.battleLoading} role="status">Preparing skirmish…</main>,
});

type Credential = {
  code: string;
  seed?: number;
  hostPeerId: string;
  peerId: string;
  grant: string;
  expiresAt: number;
  peerJs: { host: string; port: number; path: string; key: string; secure: boolean };
  peerToken: string;
  peerExpiresAt: number;
  iceServers: RTCIceServer[];
};

type LobbyMode = "choose" | "hostSetup" | "joining" | "waiting" | "battle";
type LobbyPlayer = { owner: Owner; peerId?: string; connected: boolean; host?: boolean; ai?: boolean; forfeited?: boolean };
type PeerConstructor = typeof import("peerjs").Peer;

declare global {
  interface Window {
    __SHIFTFRONT_PEER_FACTORY__?: () => PeerConstructor;
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "multiplayer_unavailable");
  return payload;
}

function peerOptions(credential: Credential) {
  return {
    ...credential.peerJs,
    token: credential.peerToken,
    config: { iceServers: credential.iceServers },
    debug: 0 as const,
  };
}

function waitForPeerOpen(peer: Peer, timeoutMs = 15_000): Promise<void> {
  if (peer.open) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("peer_open_timeout")), timeoutMs);
    const onOpen = () => finish();
    const onError = (error: Error) => finish(error);
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      peer.off("open", onOpen);
      peer.off("error", onError);
      if (error) reject(error); else resolve();
    };
    peer.on("open", onOpen);
    peer.on("error", onError);
  });
}

function publicError(error: unknown): string {
  const reason = error instanceof Error ? error.message : "multiplayer_unavailable";
  const messages: Record<string, string> = {
    invalid_code: "Enter a six-letter room code.",
    room_full: "That room is full or has already started.",
    server_not_configured: "Online play is not configured on this server yet.",
    unconfigured: "Online play is not configured on this server yet.",
    invalid_handshake: "The room handshake could not be verified.",
    peerovo_unavailable: "Could not get a secure connection. Try again in a moment.",
    ticket_unavailable: "Could not get a secure connection. Try again in a moment.",
  };
  if (reason.includes("peer-unavailable")) return "No host is online for that code. Check it and try again.";
  return messages[reason] ?? "Could not connect to the room. Check your network and try again.";
}

function PeerFactory() {
  if (process.env.NEXT_PUBLIC_E2E_MULTIPLAYER === "1" && typeof window !== "undefined" && window.__SHIFTFRONT_PEER_FACTORY__) {
    return Promise.resolve(window.__SHIFTFRONT_PEER_FACTORY__());
  }
  return import("peerjs").then(({ Peer: PeerConstructor }) => PeerConstructor);
}

function validOwners(value: unknown, localOwner: Owner): value is Owner[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 4 &&
    value.every((owner) => owner === 0 || owner === 1 || owner === 2 || owner === 3) &&
    value.includes(0) && value.includes(localOwner) && new Set(value).size === value.length;
}

function validAiOwners(value: unknown, owners: readonly Owner[], localHumanOwner: unknown): value is Owner[] {
  return Array.isArray(value) && new Set(value).size === value.length &&
    value.every((owner) => (owner === 1 || owner === 2 || owner === 3) && owner !== localHumanOwner && owners.includes(owner));
}

function ownerLabel(owner: Owner): string {
  return ["Northwest · Host", "Northeast", "Southeast", "Southwest"][owner] ?? `Player ${owner + 1}`;
}

export function MultiplayerLobby() {
  const [mode, setMode] = useState<LobbyMode>("choose");
  const [seed, setSeed] = useState("0000");
  const [joinCode, setJoinCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Create a room or join with a six-letter code.");
  const [gameSeed, setGameSeed] = useState<number | null>(null);
  const [session, setSession] = useState<MultiplayerSession | null>(null);
  const [roster, setRoster] = useState<LobbyPlayer[]>([{ owner: 0, connected: true, host: true }]);
  const [guestOwner, setGuestOwner] = useState<Owner | null>(null);
  const [lobbyRole, setLobbyRole] = useState<"host" | "guest" | null>(null);
  const [, setSessionRevision] = useState(0);
  const peerRef = useRef<Peer | null>(null);
  const guestConnectionRef = useRef<DataConnection | null>(null);
  const hostConnectionsRef = useRef(new Map<string, DataConnection>());
  const hostSeatsRef = useRef(new Map<string, Owner>());
  const hostAiOwnersRef = useRef(new Set<Owner>());
  const hostSeatTimersRef = useRef(new Map<string, number>());
  const hostForfeitedRef = useRef(new Set<string>());
  const handshakeConnectionsRef = useRef(new Set<DataConnection>());
  const credentialRef = useRef<Credential | null>(null);
  const roleRef = useRef<"host" | "guest" | null>(null);
  const hostStartedRef = useRef(false);
  const sessionRef = useRef<MultiplayerSession | null>(null);
  const beginGuestConnectionRef = useRef<(credential: Credential, peer: Peer) => void>(() => undefined);
  const scheduleGuestRetryRef = useRef<(credential: Credential, peer: Peer, delayMs?: number) => void>(() => undefined);
  const reconnectTimerRef = useRef(0);
  const guestReconnectTimerRef = useRef(0);
  const disconnectTimerRef = useRef(0);
  const signalingRetryUntilRef = useRef(0);
  const guestRetryUntilRef = useRef(0);
  const guestConnectingRef = useRef(false);
  const mountedRef = useRef(true);
  const multiplayerDialogRef = useModalFocus(
    mode === "battle" && !!session && (session.status === "disconnected" || session.status === "ended"),
    session?.status,
    "dialog",
  );

  const refreshPeerCredential = useCallback(async (credential: Credential, peer: Peer) => {
    const refreshed = await postJson<Omit<Credential, "code" | "seed" | "hostPeerId" | "grant" | "expiresAt"> & { peerId: string }>("/api/multiplayer/peer-credentials", { grant: credential.grant });
    credential.peerToken = refreshed.peerToken;
    credential.peerExpiresAt = refreshed.peerExpiresAt;
    credential.iceServers = refreshed.iceServers;
    peer.options.token = refreshed.peerToken;
    peer.options.config = { iceServers: refreshed.iceServers };
  }, []);

  const publishRoster = useCallback(() => {
    const peerByOwner = new Map([...hostSeatsRef.current.entries()].map(([peerId, owner]) => [owner, peerId]));
    const players: LobbyPlayer[] = [0, 1, 2, 3].map((value) => {
      const owner = value as Owner;
      if (owner === 0) return { owner, connected: true, host: true };
      const peerId = peerByOwner.get(owner);
      if (peerId) return {
        owner,
        peerId,
        connected: hostConnectionsRef.current.get(peerId)?.open === true,
        forfeited: hostForfeitedRef.current.has(peerId),
      };
      return { owner, connected: false, ai: hostAiOwnersRef.current.has(owner) };
    });
    setRoster(players);
  }, []);

  const destroyPeer = useCallback(() => {
    window.clearTimeout(reconnectTimerRef.current);
    window.clearTimeout(guestReconnectTimerRef.current);
    window.clearTimeout(disconnectTimerRef.current);
    for (const timer of hostSeatTimersRef.current.values()) window.clearTimeout(timer);
    hostSeatTimersRef.current.clear();
    const guestConnection = guestConnectionRef.current;
    guestConnectionRef.current = null;
    guestConnection?.close();
    const hostConnections = [...hostConnectionsRef.current.values()];
    hostConnectionsRef.current.clear();
    for (const connection of hostConnections) connection.close();
    peerRef.current?.destroy();
    peerRef.current = null;
    credentialRef.current = null;
    roleRef.current = null;
    setLobbyRole(null);
    hostSeatsRef.current.clear();
    hostAiOwnersRef.current.clear();
    hostForfeitedRef.current.clear();
    handshakeConnectionsRef.current.clear();
    hostStartedRef.current = false;
    guestOwnerRef.current = null;
    guestConnectingRef.current = false;
    signalingRetryUntilRef.current = 0;
    guestRetryUntilRef.current = 0;
  }, []);

  const guestOwnerRef = useRef<Owner | null>(null);

  const endCurrentMatch = useCallback(() => {
    sessionRef.current?.end();
    destroyPeer();
    sessionRef.current = null;
    setSession(null);
    setGameSeed(null);
    setInviteCode("");
    setGuestOwner(null);
    setRoster([{ owner: 0, connected: true, host: true }]);
    setMode("choose");
  }, [destroyPeer]);

  useEffect(() => {
    mountedRef.current = true;
    const hostSeatTimers = hostSeatTimersRef.current;
    const hostConnections = hostConnectionsRef.current;
    return () => {
      mountedRef.current = false;
      window.clearTimeout(reconnectTimerRef.current);
      window.clearTimeout(guestReconnectTimerRef.current);
      window.clearTimeout(disconnectTimerRef.current);
      for (const timer of hostSeatTimers.values()) window.clearTimeout(timer);
      sessionRef.current?.end();
      peerRef.current?.destroy();
      peerRef.current = null;
      guestConnectionRef.current = null;
      hostConnections.clear();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    return session.subscribe(() => {
      if (!mountedRef.current) return;
      setSessionRevision((revision) => revision + 1);
      if (session.status === "ended") {
        setStatus(session.role === "guest" ? "The host ended the skirmish." : "The skirmish has ended.");
        destroyPeer();
      }
    });
  }, [destroyPeer, session]);

  const showBattle = useCallback((nextSession: MultiplayerSession, nextSeed: number) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
    setGameSeed(nextSeed);
    setError("");
    setStatus("Skirmish in progress");
    setMode("battle");
  }, []);

  const rejectRoomFull = useCallback((connection: DataConnection) => {
    const announce = () => {
      if (!connection.open) return;
      connection.send({ type: "room_full" });
      window.setTimeout(() => { if (connection.open) connection.close(); }, 150);
    };
    if (connection.open) announce();
    else connection.once("open", announce);
  }, []);

  const bindHostConnection = useCallback((connection: DataConnection, grant: string, roomSeed: number) => {
    connection.on("data", async (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const message = raw as Record<string, unknown>;
      if (message.type === "hello") {
        if (handshakeConnectionsRef.current.has(connection)) return;
        handshakeConnectionsRef.current.add(connection);
        try {
          const peerId = connection.peer;
          const knownOwner = hostSeatsRef.current.get(peerId);
          const openUserSeat = ([1, 2, 3] as const).some((candidate) =>
            !hostAiOwnersRef.current.has(candidate) && ![...hostSeatsRef.current.values()].includes(candidate),
          );
          if (hostForfeitedRef.current.has(peerId) || (hostStartedRef.current && knownOwner === undefined) || (!hostStartedRef.current && knownOwner === undefined && !openUserSeat)) {
            rejectRoomFull(connection);
            return;
          }
          const handshake = await postJson<{ valid: boolean; seed: number }>("/api/multiplayer/handshake", { hostGrant: grant, guestGrant: message.grant, guestPeerId: peerId });
          if (!connection.open || !handshake.valid || handshake.seed !== roomSeed) throw new Error("invalid_handshake");
          let owner = knownOwner;
          if (owner === undefined) {
            const used = new Set(hostSeatsRef.current.values());
            owner = ([1, 2, 3] as const).find((candidate) => !used.has(candidate) && !hostAiOwnersRef.current.has(candidate));
            if (owner === undefined || hostStartedRef.current) {
              rejectRoomFull(connection);
              return;
            }
            hostSeatsRef.current.set(peerId, owner);
          }
          hostConnectionsRef.current.set(peerId, connection);
          const timer = hostSeatTimersRef.current.get(peerId);
          if (timer) window.clearTimeout(timer);
          hostSeatTimersRef.current.delete(peerId);
          publishRoster();
          const sender = { send: (value: unknown) => { if (connection.open) connection.send(value); } };
          const current = sessionRef.current;
          if (hostStartedRef.current && current) {
            if (!current.reconnectGuest(peerId, sender)) throw new Error("room_full");
            connection.send({ type: "reconnected" });
            setStatus("Guest reconnected. Resynchronizing the match.");
          } else {
            connection.send({ type: "seat", owner });
            setStatus(`${ownerLabel(owner)} joined. Start when at least two players are connected.`);
          }
        } catch (handshakeError) {
          setError(publicError(handshakeError));
          if (connection.open) connection.close();
        } finally {
          handshakeConnectionsRef.current.delete(connection);
        }
        return;
      }
      sessionRef.current?.receiveFrom(connection.peer, raw);
    });

    connection.on("error", () => {
      const activeConnection = hostConnectionsRef.current.get(connection.peer);
      if (activeConnection && activeConnection !== connection) return;
      const current = sessionRef.current;
      if (hostStartedRef.current && current && current.status !== "ended") {
        current.disconnectGuest(connection.peer);
        setStatus("A player connection encountered a network error. The match is paused while they reconnect.");
        connection.close();
      } else {
        setError("A player connection encountered a network error.");
      }
    });
    connection.on("close", () => {
      if (handshakeConnectionsRef.current.has(connection)) handshakeConnectionsRef.current.delete(connection);
      if (hostConnectionsRef.current.get(connection.peer) !== connection) return;
      hostConnectionsRef.current.delete(connection.peer);
      publishRoster();
      const peerId = connection.peer;
      const current = sessionRef.current;
      if (hostStartedRef.current && current) {
        current.disconnectGuest(peerId);
        setStatus("A player disconnected. The match is paused while they reconnect (60 seconds).");
      } else {
        setStatus("A player disconnected. Their seat is reserved for 60 seconds.");
      }
      const previousTimer = hostSeatTimersRef.current.get(peerId);
      if (previousTimer) window.clearTimeout(previousTimer);
      const timer = window.setTimeout(() => {
        hostSeatTimersRef.current.delete(peerId);
        if (hostConnectionsRef.current.has(peerId)) return;
        if (hostStartedRef.current && current) {
          const owner = current.forfeitGuest(peerId);
          if (owner !== null) {
            hostForfeitedRef.current.add(peerId);
            setStatus(`${ownerLabel(owner)} forfeited after disconnecting. The remaining match resumes.`);
          }
        } else {
          hostSeatsRef.current.delete(peerId);
          setStatus("A disconnected lobby seat was released.");
        }
        publishRoster();
      }, 60_000);
      hostSeatTimersRef.current.set(peerId, timer);
    });
  }, [publishRoster, rejectRoomFull]);

  const scheduleGuestRetry = useCallback((credential: Credential, peer: Peer, delayMs = 1800) => {
    if (!guestRetryUntilRef.current) guestRetryUntilRef.current = Date.now() + 60_000;
    if (Date.now() >= guestRetryUntilRef.current) {
      guestConnectingRef.current = false;
      if (sessionRef.current && sessionRef.current.status !== "ended") {
        sessionRef.current.end();
        destroyPeer();
        setStatus("The host did not reconnect. The skirmish has ended.");
      } else {
        destroyPeer();
        setMode("choose");
        setError("The host could not be reached. Ask them to create a new room.");
      }
      return;
    }
    window.clearTimeout(guestReconnectTimerRef.current);
    guestReconnectTimerRef.current = window.setTimeout(async () => {
      if (!mountedRef.current || peerRef.current !== peer || peer.disconnected || sessionRef.current?.status === "ended") return;
      if (guestConnectionRef.current?.open) return;
      const previous = guestConnectionRef.current;
      guestConnectionRef.current = null;
      guestConnectingRef.current = false;
      previous?.close();
      try {
        if (credential.peerExpiresAt * 1000 < Date.now() + 30_000) await refreshPeerCredential(credential, peer);
        beginGuestConnectionRef.current(credential, peer);
      } catch {
        scheduleGuestRetryRef.current(credential, peer);
      }
    }, delayMs);
  }, [destroyPeer, refreshPeerCredential]);

  useEffect(() => { scheduleGuestRetryRef.current = scheduleGuestRetry; }, [scheduleGuestRetry]);

  const startPeer = useCallback(async (credential: Credential, role: "host" | "guest") => {
    const PeerConstructor = await PeerFactory();
    if (!mountedRef.current) return null;
    const peer = new PeerConstructor(credential.peerId, peerOptions(credential));
    peerRef.current = peer;
    credentialRef.current = credential;
    roleRef.current = role;
    setLobbyRole(role);
    peer.on("error", (peerError) => {
      // PeerJS also reports WebRTC negotiation errors here. Only its
      // `disconnected` event pauses the match and starts signaling recovery;
      // active data-channel drops are handled by the connection listeners.
      if (!sessionRef.current) setError(publicError(peerError));
      if (peerError.type === "peer-unavailable" && role === "guest") {
        setStatus("Waiting for the host to come online…");
        guestConnectingRef.current = false;
        const previous = guestConnectionRef.current;
        guestConnectionRef.current = null;
        previous?.close();
        scheduleGuestRetry(credential, peer);
      }
    });
    peer.on("disconnected", () => {
      sessionRef.current?.setDisconnected();
      setStatus("Signaling disconnected. Reconnecting…");
      signalingRetryUntilRef.current = Date.now() + 60_000;
      window.clearTimeout(reconnectTimerRef.current);
      const retrySignaling = async () => {
        if (!mountedRef.current || peerRef.current !== peer) return;
        if (Date.now() >= signalingRetryUntilRef.current) {
          sessionRef.current?.end();
          destroyPeer();
          setStatus("Signaling did not recover within 60 seconds. The skirmish has ended.");
          return;
        }
        if (!peer.disconnected) return;
        try {
          if (credential.peerExpiresAt * 1000 < Date.now() + 30_000) await refreshPeerCredential(credential, peer);
          peer.reconnect();
          reconnectTimerRef.current = window.setTimeout(() => { if (peer.disconnected) void retrySignaling(); }, 1800);
        } catch {
          reconnectTimerRef.current = window.setTimeout(() => void retrySignaling(), 1800);
        }
      };
      reconnectTimerRef.current = window.setTimeout(() => void retrySignaling(), 0);
    });
    peer.on("open", () => {
      if (sessionRef.current?.status === "ended") return;
      signalingRetryUntilRef.current = 0;
      window.clearTimeout(reconnectTimerRef.current);
      setError("");
      if (role === "host") {
        sessionRef.current?.attach({ send() {} });
        setStatus(hostStartedRef.current ? "Signaling restored. The match is ready." : "Room ready. Invite guests or assign AI opponents.");
      } else if (sessionRef.current && guestConnectionRef.current?.open) {
        const connection = guestConnectionRef.current;
        sessionRef.current.attach({ send: (value: unknown) => { if (connection.open) connection.send(value); } });
        guestRetryUntilRef.current = 0;
        setStatus("Signaling restored. The skirmish has resumed.");
      } else if (guestRetryUntilRef.current > 0) {
        guestConnectingRef.current = false;
        beginGuestConnectionRef.current(credential, peer);
      }
    });
    return peer;
  }, [destroyPeer, refreshPeerCredential, scheduleGuestRetry]);

  const hostRoom = useCallback(async () => {
    const parsedSeed = Number(seed);
    if (!/^\d{4}$/.test(seed) || parsedSeed < 0 || parsedSeed > 9999) {
      setError("Choose a four-digit match seed first.");
      return;
    }
    destroyPeer();
    setInviteCode("");
    setRoster([{ owner: 0, connected: true, host: true }]);
    hostAiOwnersRef.current.clear();
    setMode("waiting");
    setError("");
    setStatus("Creating room…");
    try {
      const credential = await postJson<Credential>("/api/multiplayer/rooms", { seed: parsedSeed });
      if (!mountedRef.current) return;
      credentialRef.current = credential;
      const peer = await startPeer(credential, "host");
      if (!peer) return;
      peer.on("connection", (connection) => bindHostConnection(connection, credential.grant, parsedSeed));
      publishRoster();
      await waitForPeerOpen(peer);
      if (!mountedRef.current || peerRef.current !== peer) return;
      setInviteCode(credential.code);
    } catch (createError) {
      destroyPeer();
      setMode("hostSetup");
      setStatus("Room creation failed.");
      setError(publicError(createError));
    }
  }, [bindHostConnection, destroyPeer, publishRoster, seed, startPeer]);

  const startMatch = useCallback(() => {
    if (roleRef.current !== "host" || hostStartedRef.current) return;
    const connected = [...hostSeatsRef.current.entries()].filter(([peerId]) => hostConnectionsRef.current.get(peerId)?.open === true);
    const aiOwners = [...hostAiOwnersRef.current].sort((a, b) => a - b);
    if (connected.length + aiOwners.length < 1 || connected.length + aiOwners.length > 3) return;
    for (const peerId of [...hostSeatsRef.current.keys()]) {
      if (connected.some(([connectedId]) => connectedId === peerId)) continue;
      const timer = hostSeatTimersRef.current.get(peerId);
      if (timer) window.clearTimeout(timer);
      hostSeatTimersRef.current.delete(peerId);
      hostSeatsRef.current.delete(peerId);
    }
    const owners: Owner[] = [0 as Owner, ...connected.map(([, owner]) => owner), ...aiOwners].sort((a, b) => a - b);
    if (owners.length < 2 || aiOwners.some((owner) => !owners.includes(owner))) return;
    const roomSeed = Number(seed);
    const hostSession = new MultiplayerSession("host", 0, roomSeed, { send() {} }, owners, aiOwners);
    for (const [peerId, owner] of connected) {
      const connection = hostConnectionsRef.current.get(peerId);
      if (!connection?.open || !hostSession.addGuest(peerId, owner, { send: (value) => { if (connection.open) connection.send(value); } })) return;
    }
    hostSession.armIntroBarrier();
    hostStartedRef.current = true;
    sessionRef.current = hostSession;
    for (const [peerId, owner] of connected) {
      hostConnectionsRef.current.get(peerId)?.send({ type: "start", seed: roomSeed, settings: SKIRMISH_MATCH_SETTINGS, owner, owners, aiOwners });
    }
    showBattle(hostSession, roomSeed);
  }, [seed, showBattle]);

  const beginGuestConnection = useCallback((credential: Credential, peer: Peer) => {
    if (!mountedRef.current || peerRef.current !== peer || peer.disconnected || guestConnectingRef.current ||
        guestConnectionRef.current?.open || sessionRef.current?.status === "ended") return;
    guestConnectingRef.current = true;
    const connection = peer.connect(credential.hostPeerId, { reliable: true });
    guestConnectionRef.current = connection;
    connection.on("data", (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const message = raw as Record<string, unknown>;
      if (message.type === "room_full") {
        window.clearTimeout(guestReconnectTimerRef.current);
        guestRetryUntilRef.current = 0;
        guestConnectingRef.current = false;
        if (guestConnectionRef.current === connection) guestConnectionRef.current = null;
        destroyPeer();
        setMode("choose");
        setStatus("This room is full or has already started.");
        setError(publicError(new Error("room_full")));
        return;
      }
      if (message.type === "seat" && Number.isInteger(message.owner) && Number(message.owner) >= 1 && Number(message.owner) <= 3) {
        const owner = Number(message.owner) as Owner;
        guestOwnerRef.current = owner;
        setGuestOwner(owner);
        setMode("waiting");
        setStatus(`${ownerLabel(owner)} is reserved. Waiting for the host to start.`);
        return;
      }
      if (message.type === "start" && !sessionRef.current) {
        const seedValue = Number(message.seed);
        const owner = message.owner;
        if (!Number.isInteger(message.seed) || seedValue < 0 || seedValue > 9999 ||
            !validSkirmishMatchSettings(message.settings) || (owner !== 1 && owner !== 2 && owner !== 3) ||
            !validOwners(message.owners, owner) || !validAiOwners(message.aiOwners, message.owners, owner)) {
          setError("The host sent incompatible match settings.");
          connection.close();
          return;
        }
        const sender = { send: (value: unknown) => { if (connection.open) connection.send(value); } };
        const next = new MultiplayerSession("guest", owner, seedValue, sender, message.owners, message.aiOwners);
        next.armIntroBarrier();
        guestOwnerRef.current = owner;
        setGuestOwner(owner);
        showBattle(next, seedValue);
        return;
      }
      if (message.type === "reconnected") {
        sessionRef.current?.attach({ send: (value: unknown) => { if (connection.open) connection.send(value); } });
        connection.send({ type: "resume" });
        window.clearTimeout(disconnectTimerRef.current);
        setStatus("Reconnected. Resynchronizing the match.");
        return;
      }
      sessionRef.current?.receive(raw);
    });
    connection.on("open", () => {
      if (guestConnectionRef.current !== connection) {
        connection.close();
        return;
      }
      guestConnectingRef.current = false;
      guestRetryUntilRef.current = 0;
      window.clearTimeout(guestReconnectTimerRef.current);
      connection.send({ type: "hello", grant: credential.grant });
    });
    connection.on("close", () => {
      if (guestConnectionRef.current !== connection) return;
      guestConnectionRef.current = null;
      guestConnectingRef.current = false;
      guestRetryUntilRef.current = Date.now() + 60_000;
      if (sessionRef.current && sessionRef.current.status !== "ended") {
        sessionRef.current.setDisconnected();
        setStatus("Host connection lost. Reconnecting for 60 seconds…");
        window.clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = window.setTimeout(() => {
          if (sessionRef.current?.status === "disconnected") {
            sessionRef.current.end();
            setStatus("The host left. The skirmish has ended.");
          }
        }, 60_000);
      } else {
        setStatus("Host connection lost. Retrying for 60 seconds…");
      }
      scheduleGuestRetry(credential, peer, 1200);
    });
    connection.on("error", () => {
      if (guestConnectionRef.current !== connection) return;
      guestConnectingRef.current = false;
      const current = sessionRef.current;
      if (current && current.status !== "ended") {
        current.setDisconnected();
        setStatus("The host data connection encountered a network error. Reconnecting…");
      } else {
        setStatus("Connecting to host…");
      }
      connection.close();
      scheduleGuestRetry(credential, peer);
    });
  }, [destroyPeer, scheduleGuestRetry, showBattle]);

  const setSeatAi = useCallback((owner: Owner) => {
    if (owner === 0 || roleRef.current !== "host" || hostStartedRef.current) return;
    if ([...hostSeatsRef.current.values()].includes(owner)) return;
    if (hostAiOwnersRef.current.has(owner)) hostAiOwnersRef.current.delete(owner);
    else hostAiOwnersRef.current.add(owner);
    publishRoster();
  }, [publishRoster]);

  useEffect(() => { beginGuestConnectionRef.current = beginGuestConnection; }, [beginGuestConnection]);

  const joinRoom = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    const normalized = joinCode.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z]{6}$/.test(normalized)) {
      setError("Enter the host’s six-letter code.");
      return;
    }
    destroyPeer();
    setMode("joining");
    setError("");
    setStatus("Looking up room…");
    try {
      const credential = await postJson<Credential>("/api/multiplayer/rooms/join", { code: normalized });
      if (!mountedRef.current) return;
      credentialRef.current = credential;
      guestRetryUntilRef.current = Date.now() + 60_000;
      setStatus("Connecting to host…");
      const peer = await startPeer(credential, "guest");
      if (!peer) return;
      const waitForOpen = () => {
        if (peer.open) beginGuestConnection(credential, peer);
        else peer.once("open", () => beginGuestConnection(credential, peer));
      };
      waitForOpen();
    } catch (joinError) {
      setMode("choose");
      setStatus("Room lookup failed.");
      setError(publicError(joinError));
    }
  }, [beginGuestConnection, destroyPeer, joinCode, startPeer]);

  const copyInvite = useCallback(async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setStatus("Invite code copied.");
    } catch {
      setError("Could not copy the invite code. Select it to copy manually.");
    }
  }, [inviteCode]);

  if (mode === "battle" && session && gameSeed !== null) {
    const disconnected = session.status === "disconnected";
    const ended = session.status === "ended";
    const connectionStatus = status === "Skirmish in progress" ? "Reconnecting automatically…" : status;
    const connectionTitle = connectionStatus.toLowerCase().includes("signaling")
      ? "Signaling interrupted"
      : connectionStatus.toLowerCase().includes("host")
        ? "Host connection lost"
        : "Player connection interrupted";
    return (
      <div className={styles.battle}>
        {!ended ? <DynamicGameClient seed={gameSeed} mission={0} resume={false} fresh multiplayerSession={session} /> : null}
        {disconnected || ended ? (
          <div className={styles.connectionOverlay} data-state={ended ? "ended" : "disconnected"}>
            <MetalPanel
              ref={multiplayerDialogRef}
              tabIndex={-1}
              className={styles.connectionDialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="multiplayer-connection-title"
              aria-describedby="multiplayer-connection-description"
            >
              <ConsoleLabel>ONLINE SKIRMISH · NETWORK STATUS</ConsoleLabel>
              <h1 id="multiplayer-connection-title" className={styles.connectionTitle}>
                {ended ? "Connection ended" : connectionTitle}
              </h1>
              <p id="multiplayer-connection-description" className={styles.connectionDescription}>
                {ended
                  ? "This skirmish can no longer continue. Return to the multiplayer menu to start or join another room."
                  : connectionStatus.toLowerCase().includes("signaling")
                    ? "The match is paused while your signaling connection recovers. Reconnection is automatic for up to 60 seconds."
                    : session.role === "host"
                    ? "The match is paused while the disconnected player reconnects. Their seat is reserved for up to 60 seconds."
                    : "The match is paused while your connection to the host recovers. Reconnection is automatic for up to 60 seconds."}
              </p>
              <p className={styles.connectionStatus} role="status">
                {ended && status === "Skirmish in progress" ? "Connection to the room ended." : connectionStatus}
              </p>
              <div className={styles.connectionActions}>
                <ConsoleButton onClick={endCurrentMatch}>
                  {ended ? "Return to menu" : "Leave skirmish"}
                </ConsoleButton>
              </div>
            </MetalPanel>
          </div>
        ) : null}
      </div>
    );
  }

  const activePlayers = roster.filter((player) => player.host || (player.connected && !player.forfeited) || player.ai).length;
  return (
    <main className={styles.screen}>
      <MetalPanel as="section" className={styles.panel} role="region" aria-labelledby="multiplayer-title">
        <ConsoleLabel>ONLINE SKIRMISH · FREE-FOR-ALL</ConsoleLabel>
        <h1 id="multiplayer-title">{mode === "waiting" ? (lobbyRole === "host" ? "Room open" : "Waiting for host") : mode === "joining" ? "Joining room" : "Multiplayer"}</h1>
        {mode === "choose" ? (
          <>
            <p>Host a room, invite up to three guests, or fill vacant corners with AI. The host can start with at least one opponent.</p>
            <div className={styles.actions}>
              <ConsoleButton onClick={() => { setMode("hostSetup"); setError(""); }}>Host a room</ConsoleButton>
              <form onSubmit={joinRoom} className={styles.joinForm}>
                <label htmlFor="join-code">Host code</label>
                <input id="join-code" data-testid="multiplayer-code-input" value={joinCode} maxLength={6} autoComplete="off" spellCheck={false} onChange={(event) => { setJoinCode(event.currentTarget.value.toUpperCase()); setError(""); }} />
                <ConsoleButton type="submit" disabled={joinCode.length !== 6}>Join room</ConsoleButton>
              </form>
            </div>
          </>
        ) : mode === "hostSetup" ? (
          <>
            <p>Choose the four-digit match seed. This is separate from the invite code.</p>
            <label htmlFor="multiplayer-seed">Match seed</label>
            <div className={styles.seedRow}>
              <input id="multiplayer-seed" data-testid="multiplayer-seed-input" value={seed} inputMode="numeric" maxLength={4} onChange={(event) => setSeed(event.currentTarget.value.replace(/\D/g, "").slice(0, 4))} />
              <ConsoleButton muted onClick={() => setSeed(rollSeed())}>Roll seed</ConsoleButton>
            </div>
            <div className={styles.actions}>
              <ConsoleButton onClick={() => void hostRoom()}>Create room</ConsoleButton>
              <ConsoleButton muted onClick={() => setMode("choose")}>Back</ConsoleButton>
            </div>
          </>
        ) : mode === "waiting" ? (
          <>
            {lobbyRole === "host" ? (
              <>
                <p>Invite guests or switch vacant User seats to AI. Start locks the roster and places each force in its corner.</p>
                <div className={styles.inviteCode} data-testid="multiplayer-invite-code">{inviteCode || "······"}</div>
                <ul className={styles.roster} data-testid="multiplayer-roster" aria-label="Room roster">
                  {roster.map((player) => (
                    <li key={player.owner} data-testid={`multiplayer-roster-seat-${player.owner}`}>
                      <span>{ownerLabel(player.owner)}</span>
                      <span>{player.host ? "Host" : player.forfeited ? "Forfeited" : player.ai ? "AI opponent" : player.peerId ? player.connected ? "Connected" : "Reserved · reconnecting" : "Open User seat"}</span>
                      {!player.host && !player.peerId ? (
                        <button
                          type="button"
                          className={styles.seatToggle}
                          data-testid={`multiplayer-seat-toggle-${player.owner}`}
                          aria-label={`Set ${ownerLabel(player.owner)} to ${player.ai ? "User" : "AI"}`}
                          onClick={() => setSeatAi(player.owner)}
                        >
                          {player.ai ? "Switch to User" : "Switch to AI"}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className={styles.actions}>
                  <ConsoleButton muted onClick={() => void copyInvite()} disabled={!inviteCode}>Copy code</ConsoleButton>
                  <ConsoleButton data-testid="multiplayer-start-button" onClick={startMatch} disabled={activePlayers < 2}>Start skirmish</ConsoleButton>
                  <ConsoleButton muted onClick={endCurrentMatch}>Close room</ConsoleButton>
                </div>
              </>
            ) : (
              <>
                <p data-testid="multiplayer-seat">{guestOwner === null ? "Verifying your room seat…" : `${ownerLabel(guestOwner)} is reserved.`}</p>
                <p>The host will start the match when ready. Your corner and the match seed are set by the host.</p>
                <ConsoleButton muted onClick={endCurrentMatch}>Leave room</ConsoleButton>
              </>
            )}
          </>
        ) : (
          <p role="status">{status}</p>
        )}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <p className={styles.status} role="status">{status}</p>
        {mode === "choose" ? <Link className={styles.backLink} href="/">Back to menu</Link> : null}
      </MetalPanel>
    </main>
  );
}

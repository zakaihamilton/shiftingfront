import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DataConnection, Peer } from "peerjs";
import type { Owner } from "@/lib/types";
import { MultiplayerSession, SKIRMISH_MATCH_SETTINGS, validSkirmishMatchSettings } from "@/lib/multiplayer/session";
import { createCampaign } from "@/lib/gen/campaign";
import type { Credential, LobbyMode, LobbyPlayer } from "./types";
import { PeerLifecycle } from "./peerLifecycle";
import { PeerFactory, ownerLabel, peerOptions, postJson, publicError, validAiOwners, validOwners } from "./utils";

export function useMultiplayerLobbyController() {
  const router = useRouter();
  const [mode, setMode] = useState<LobbyMode>("choose");
  const [seed, setSeed] = useState("0000");
  const skirmishBiome = useMemo(() => /^\d{4}$/.test(seed) ? createCampaign(Number(seed)).world.biome : null, [seed]);
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
  const [lifecycle] = useState(() => new PeerLifecycle({
    createPeer: async (credential) => {
      const PeerConstructor = await PeerFactory();
      return new PeerConstructor(credential.peerId, peerOptions(credential));
    },
    request: postJson,
    now: () => Date.now(),
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (timer) => window.clearTimeout(timer),
  }));
  const guestConnectionRef = useRef<DataConnection | null>(null);
  const hostConnectionsRef = useRef(new Map<string, DataConnection>());
  const hostSeatsRef = useRef(new Map<string, Owner>());
  const hostAiOwnersRef = useRef(new Set<Owner>());
  const hostForfeitedRef = useRef(new Set<string>());
  const handshakeConnectionsRef = useRef(new Set<DataConnection>());
  const hostStartedRef = useRef(false);
  const sessionRef = useRef<MultiplayerSession | null>(null);
  const beginGuestConnectionRef = useRef<(credential: Credential, peer: Peer) => void>(() => undefined);
  const guestConnectingRef = useRef(false);
  const mountedRef = useRef(true);


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
    lifecycle.dispose();
    guestConnectionRef.current = null;
    hostConnectionsRef.current.clear();
    setLobbyRole(null);
    hostSeatsRef.current.clear();
    hostAiOwnersRef.current.clear();
    hostForfeitedRef.current.clear();
    handshakeConnectionsRef.current.clear();
    hostStartedRef.current = false;
    guestOwnerRef.current = null;
    guestConnectingRef.current = false;
    lifecycle.finishGuestRecovery();
  }, [lifecycle]);

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

  const showHostSetup = useCallback(() => {
    setMode("hostSetup");
    setError("");
  }, []);

  const backToChoose = useCallback(() => {
    setMode("choose");
    setError("");
  }, []);

  const cancelJoin = useCallback(() => {
    destroyPeer();
    setMode("choose");
    setStatus("Create a room or join with a six-letter code.");
    setError("");
  }, [destroyPeer]);

  const backToMenu = useCallback(() => {
    router.push("/");
  }, [router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.repeat ||
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (mode === "battle" && session &&
          session.status !== "disconnected" && session.status !== "ended") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (mode === "choose") backToMenu();
      else if (mode === "hostSetup") backToChoose();
      else if (mode === "joining") cancelJoin();
      else endCurrentMatch();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [backToChoose, backToMenu, cancelJoin, endCurrentMatch, mode, session]);

  useEffect(() => {
    mountedRef.current = true;
    const hostConnections = hostConnectionsRef.current;
    return () => {
      mountedRef.current = false;
      sessionRef.current?.end();
      lifecycle.dispose();
      guestConnectionRef.current = null;
      hostConnections.clear();
    };
  }, [lifecycle]);

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
    const operation = lifecycle.operation;
    const announce = () => {
      if (!lifecycle.isCurrent(operation) || !connection.open) return;
      connection.send({ type: "room_full" });
      lifecycle.schedule(`reject:${connection.connectionId}`, () => { if (connection.open) connection.close(); }, 150);
    };
    if (connection.open) announce();
    else connection.once("open", announce);
  }, [lifecycle]);

  const bindHostConnection = useCallback((connection: DataConnection, grant: string, roomSeed: number) => {
    const operation = lifecycle.operation;
    lifecycle.trackConnection(connection);
    const isCurrentConnection = () => mountedRef.current && lifecycle.isCurrent(operation);

    connection.on("data", async (raw) => {
      if (!isCurrentConnection()) return;
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
          const handshake = await lifecycle.request<{ valid: boolean; seed: number }>("/api/multiplayer/handshake", { hostGrant: grant, guestGrant: message.grant, guestPeerId: peerId });
          if (!isCurrentConnection()) return;
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
          lifecycle.clearTimer(`seat:${peerId}`);
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
          if (!isCurrentConnection()) return;
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
      if (!isCurrentConnection()) return;
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
      if (!isCurrentConnection()) return;
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
      lifecycle.schedule(`seat:${peerId}`, () => {
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
    });
  }, [lifecycle, publishRoster, rejectRoomFull]);

  const scheduleGuestRetry = useCallback((credential: Credential, peer: Peer, delayMs = 1800) => {
    lifecycle.retryGuest(credential, peer, {
      canRetry: () => mountedRef.current && !guestConnectionRef.current?.open && sessionRef.current?.status !== "ended",
      connect: () => {
        const previous = guestConnectionRef.current;
        guestConnectionRef.current = null;
        guestConnectingRef.current = false;
        previous?.close();
        beginGuestConnectionRef.current(credential, peer);
      },
      expired: () => {
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
      },
    }, delayMs);
  }, [destroyPeer, lifecycle]);

  const startPeer = useCallback(async (credential: Credential, role: "host" | "guest", operation: number) => {
    const peer = await lifecycle.start(credential, role, operation, {
      error: (peerError) => {
        if (!sessionRef.current) setError(publicError(peerError));
      },
      unavailable: () => {
        setStatus("Waiting for the host to come online…");
        guestConnectingRef.current = false;
        const previous = guestConnectionRef.current;
        guestConnectionRef.current = null;
        previous?.close();
        if (lifecycle.peer) scheduleGuestRetry(credential, lifecycle.peer);
      },
      disconnected: () => {
        sessionRef.current?.setDisconnected();
        setStatus("Signaling disconnected. Reconnecting…");
      },
      expired: () => {
        sessionRef.current?.end();
        destroyPeer();
        setStatus("Signaling did not recover within 60 seconds. The skirmish has ended.");
      },
      open: () => {
        if (sessionRef.current?.status === "ended") return;
        setError("");
        if (role === "host") {
          sessionRef.current?.attach({ send() {} });
          setStatus(hostStartedRef.current ? "Signaling restored. The match is ready." : "Room ready. Invite guests or assign AI opponents.");
        } else if (sessionRef.current && guestConnectionRef.current?.open) {
          const connection = guestConnectionRef.current;
          sessionRef.current.attach({ send: (value: unknown) => { if (connection.open) connection.send(value); } });
          lifecycle.finishGuestRecovery();
          setStatus("Signaling restored. The skirmish has resumed.");
        } else if (lifecycle.guestRetryUntil > 0 && lifecycle.peer) {
          guestConnectingRef.current = false;
          beginGuestConnectionRef.current(credential, lifecycle.peer);
        }
      },
    });
    if (peer) setLobbyRole(role);
    return peer;
  }, [destroyPeer, lifecycle, scheduleGuestRetry]);

  const hostRoom = useCallback(async () => {
    const parsedSeed = Number(seed);
    if (!/^\d{4}$/.test(seed) || parsedSeed < 0 || parsedSeed > 9999) {
      setError("Choose a four-digit match seed first.");
      return;
    }
    destroyPeer();
    const operation = lifecycle.operation;
    setInviteCode("");
    setRoster([{ owner: 0, connected: true, host: true }]);
    hostAiOwnersRef.current.clear();
    setMode("waiting");
    setError("");
    setStatus("Creating room…");
    try {
      const credential = await lifecycle.request<Credential>("/api/multiplayer/rooms", { seed: parsedSeed });
      if (!mountedRef.current || !lifecycle.isCurrent(operation)) return;
      const peer = await startPeer(credential, "host", operation);
      if (!peer) return;
      peer.on("connection", (connection) => {
        if (!lifecycle.isCurrent(operation)) { connection.close(); return; }
        bindHostConnection(connection, credential.grant, parsedSeed);
      });
      publishRoster();
      await lifecycle.waitForOpen(peer);
      if (!mountedRef.current || !lifecycle.isCurrent(operation) || !lifecycle.owns(peer)) return;
      setInviteCode(credential.code);
    } catch (createError) {
      if (!mountedRef.current || !lifecycle.isCurrent(operation)) return;
      destroyPeer();
      setMode("hostSetup");
      setStatus("Room creation failed.");
      setError(publicError(createError));
    }
  }, [bindHostConnection, destroyPeer, lifecycle, publishRoster, seed, startPeer]);

  const startMatch = useCallback(() => {
    if (lifecycle.role !== "host" || hostStartedRef.current) return;
    const connected = [...hostSeatsRef.current.entries()].filter(([peerId]) => hostConnectionsRef.current.get(peerId)?.open === true);
    const aiOwners = [...hostAiOwnersRef.current].sort((a, b) => a - b);
    if (connected.length + aiOwners.length < 1 || connected.length + aiOwners.length > 3) return;
    for (const peerId of [...hostSeatsRef.current.keys()]) {
      if (connected.some(([connectedId]) => connectedId === peerId)) continue;
      lifecycle.clearTimer(`seat:${peerId}`);
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
  }, [lifecycle, seed, showBattle]);

  const beginGuestConnection = useCallback((credential: Credential, peer: Peer) => {
    if (!mountedRef.current || !lifecycle.owns(peer) || peer.disconnected || guestConnectingRef.current ||
        guestConnectionRef.current?.open || sessionRef.current?.status === "ended") return;
    guestConnectingRef.current = true;
    const connection = peer.connect(credential.hostPeerId, { reliable: true });
    guestConnectionRef.current = connection;
    lifecycle.trackConnection(connection);
    const operation = lifecycle.operation;
    const isCurrentConnection = () => mountedRef.current && lifecycle.isCurrent(operation) && guestConnectionRef.current === connection;
    connection.on("data", (raw) => {
      if (!isCurrentConnection()) return;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const message = raw as Record<string, unknown>;
      if (message.type === "room_full") {
        lifecycle.finishGuestRecovery();
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
        lifecycle.clearTimer("guest-disconnect");
        setStatus("Reconnected. Resynchronizing the match.");
        return;
      }
      sessionRef.current?.receive(raw);
    });
    connection.on("open", () => {
      if (!isCurrentConnection()) {
        connection.close();
        return;
      }
      guestConnectingRef.current = false;
      lifecycle.finishGuestRecovery();
      connection.send({ type: "hello", grant: credential.grant });
    });
    connection.on("close", () => {
      if (!isCurrentConnection()) return;
      guestConnectionRef.current = null;
      guestConnectingRef.current = false;
      lifecycle.beginGuestRecovery();
      if (sessionRef.current && sessionRef.current.status !== "ended") {
        sessionRef.current.setDisconnected();
        setStatus("Host connection lost. Reconnecting for 60 seconds…");
        lifecycle.clearTimer("guest-disconnect");
        lifecycle.schedule("guest-disconnect", () => {
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
      if (!isCurrentConnection()) return;
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
  }, [destroyPeer, lifecycle, scheduleGuestRetry, showBattle]);

  const setSeatAi = useCallback((owner: Owner) => {
    if (owner === 0 || lifecycle.role !== "host" || hostStartedRef.current) return;
    if ([...hostSeatsRef.current.values()].includes(owner)) return;
    if (hostAiOwnersRef.current.has(owner)) hostAiOwnersRef.current.delete(owner);
    else hostAiOwnersRef.current.add(owner);
    publishRoster();
  }, [lifecycle, publishRoster]);

  useEffect(() => { beginGuestConnectionRef.current = beginGuestConnection; }, [beginGuestConnection]);

  const joinRoom = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    const normalized = joinCode.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z]{6}$/.test(normalized)) {
      setError("Enter the host’s six-letter code.");
      return;
    }
    destroyPeer();
    const operation = lifecycle.operation;
    setMode("joining");
    setError("");
    setStatus("Looking up room…");
    try {
      const credential = await lifecycle.request<Credential>("/api/multiplayer/rooms/join", { code: normalized });
      if (!mountedRef.current || !lifecycle.isCurrent(operation)) return;
      lifecycle.beginGuestRecovery();
      setStatus("Connecting to host…");
      const peer = await startPeer(credential, "guest", operation);
      if (!peer) return;
      const waitForOpen = () => {
        if (peer.open) beginGuestConnection(credential, peer);
        else peer.once("open", () => beginGuestConnection(credential, peer));
      };
      waitForOpen();
    } catch (joinError) {
      if (!mountedRef.current || !lifecycle.isCurrent(operation)) return;
      setMode("choose");
      setStatus("Room lookup failed.");
      setError(publicError(joinError));
    }
  }, [beginGuestConnection, destroyPeer, joinCode, lifecycle, startPeer]);

  const copyInvite = useCallback(async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setStatus("Invite code copied.");
    } catch {
      setError("Could not copy the invite code. Select it to copy manually.");
    }
  }, [inviteCode]);

  const changeJoinCode = useCallback((value: string) => {
    setJoinCode(value);
    setError("");
  }, []);

  const activePlayers = roster.filter((player) => player.host || (player.connected && !player.forfeited) || player.ai).length;

  return {
    mode,
    seed,
    skirmishBiome,
    joinCode,
    inviteCode,
    error,
    status,
    gameSeed,
    session,
    roster,
    guestOwner,
    lobbyRole,
    activePlayers,
    setSeed,
    changeJoinCode,
    showHostSetup,
    backToChoose,
    backToMenu,
    hostRoom,
    joinRoom,
    startMatch,
    setSeatAi,
    copyInvite,
    endCurrentMatch,
  };
}

export type MultiplayerLobbyModel = ReturnType<typeof useMultiplayerLobbyController>;

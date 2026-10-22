import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DataConnection, Peer } from "peerjs";
import type { Owner } from "@/lib/types";
import { MultiplayerSession, type MultiplayerStatus } from "@/lib/multiplayer/session";
import { createCampaign } from "@/lib/gen/campaign";
import type { Credential, LobbyPlayer } from "./types";
import { PeerLifecycle } from "./peerLifecycle";
import { PeerFactory, peerOptions, postJson, publicError } from "./utils";
import { createHostLobbyController } from "./hostController";
import { createGuestLobbyController, createGuestRecoveryAction } from "./guestController";
import { useLobbyMode, type LobbyEscapeHandlers } from "./useLobbyMode";

export function useMultiplayerLobbyController() {
  const router = useRouter();
  const escapeRef = useRef<LobbyEscapeHandlers>({
    mode: "choose",
    session: null,
    backToMenu: () => undefined,
    backToChoose: () => undefined,
    cancelJoin: () => undefined,
    endCurrentMatch: () => undefined,
  });
  const {
    mode,
    setMode,
    error,
    setError,
    showHostSetup,
    backToChoose,
    enterBattle,
  } = useLobbyMode(escapeRef);
  const [seed, setSeed] = useState("0000");
  const skirmishBiome = useMemo(() => /^\d{4}$/.test(seed) ? createCampaign(Number(seed)).world.biome : null, [seed]);
  const [joinCode, setJoinCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [status, setStatus] = useState("Create a room or join with a six-letter code.");
  const [gameSeed, setGameSeed] = useState<number | null>(null);
  const [session, setSession] = useState<MultiplayerSession | null>(null);
  const subscribeSession = useCallback((listener: () => void) => session?.subscribe(listener) ?? (() => {}), [session]);
  const sessionSnapshot = useCallback((): MultiplayerStatus => session?.status ?? "ended", [session]);
  const sessionStatus = useSyncExternalStore<MultiplayerStatus>(subscribeSession, sessionSnapshot, () => "ended");
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
  const guestOwnerRef = useRef<Owner | null>(null);
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
  }, [destroyPeer, setMode]);

  const cancelJoin = useCallback(() => {
    destroyPeer();
    setMode("choose");
    setStatus("Create a room or join with a six-letter code.");
    setError("");
  }, [destroyPeer, setError, setMode]);

  const backToMenu = useCallback(() => {
    router.push("/");
  }, [router]);

  useEffect(() => {
    escapeRef.current = { mode, session, backToMenu, backToChoose, cancelJoin, endCurrentMatch };
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
      if (session.synchronizationNotice) setStatus(session.synchronizationNotice);
      if (session.status === "ended") {
        setStatus(session.synchronizationNotice?.startsWith("Synchronization failed") ? session.synchronizationNotice
          : session.role === "guest" ? "The host ended the skirmish." : "The skirmish has ended.");
        destroyPeer();
      }
    });
  }, [destroyPeer, session]);

  const showBattle = useCallback((nextSession: MultiplayerSession, nextSeed: number) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
    setGameSeed(nextSeed);
    enterBattle();
    setStatus("Skirmish in progress");
  }, [enterBattle]);

  const scheduleGuestRetry = useCallback((credential: Credential, peer: Peer, delayMs = 1800) => {
    createGuestRecoveryAction({
      lifecycle,
      refs: {
        mounted: mountedRef,
        connection: guestConnectionRef,
        owner: guestOwnerRef,
        connecting: guestConnectingRef,
        session: sessionRef,
        beginConnection: beginGuestConnectionRef,
      },
      destroyPeer,
      setMode,
      setStatus,
      setError,
    })(credential, peer, delayMs);
  }, [destroyPeer, lifecycle, setError, setMode]);

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
  }, [destroyPeer, lifecycle, scheduleGuestRetry, setError]);

  const guestController = useCallback(() => createGuestLobbyController({
    joinCode,
    lifecycle,
    refs: {
      mounted: mountedRef,
      connection: guestConnectionRef,
      owner: guestOwnerRef,
      connecting: guestConnectingRef,
      session: sessionRef,
      beginConnection: beginGuestConnectionRef,
    },
    setMode,
    setStatus,
    setError,
    setGuestOwner,
    setSession,
    destroyPeer,
    showBattle,
    startPeer,
    scheduleGuestRetry,
  }), [destroyPeer, joinCode, lifecycle, scheduleGuestRetry, setError, setMode, showBattle, startPeer]);

  const hostController = useCallback(() => createHostLobbyController({
    seed,
    lifecycle,
    refs: {
      mounted: mountedRef,
      connections: hostConnectionsRef,
      seats: hostSeatsRef,
      aiOwners: hostAiOwnersRef,
      forfeited: hostForfeitedRef,
      handshakes: handshakeConnectionsRef,
      started: hostStartedRef,
      session: sessionRef,
    },
    setRoster,
    setInviteCode,
    setMode,
    setStatus,
    setError,
    destroyPeer,
    showBattle,
    startPeer,
  }), [destroyPeer, lifecycle, seed, setError, setMode, showBattle, startPeer]);

  const beginGuestConnection = useCallback((credential: Credential, peer: Peer) => {
    guestController().beginGuestConnection(credential, peer);
  }, [guestController]);

  useEffect(() => { beginGuestConnectionRef.current = beginGuestConnection; }, [beginGuestConnection]);

  const joinRoom = useCallback((event: FormEvent) => guestController().joinRoom(event), [guestController]);
  const hostRoom = useCallback(() => hostController().hostRoom(), [hostController]);
  const startMatch = useCallback(() => hostController().startMatch(), [hostController]);
  const setSeatAi = useCallback((owner: Owner) => hostController().setSeatAi(owner), [hostController]);

  const copyInvite = useCallback(async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setStatus("Invite code copied.");
    } catch {
      setError("Could not copy the invite code. Select it to copy manually.");
    }
  }, [inviteCode, setError]);

  const changeJoinCode = useCallback((value: string) => {
    setJoinCode(value);
    setError("");
  }, [setError]);

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
    sessionStatus,
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

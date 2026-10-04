import type { DataConnection, Peer } from "peerjs";
import type { Owner } from "@/lib/types";
import { MultiplayerSession, SKIRMISH_MATCH_SETTINGS, validSkirmishMatchSettings } from "@/lib/multiplayer/session";
import type { Credential, LobbyMode, LobbyPlayer } from "./types";
import { PeerLifecycle } from "./peerLifecycle";
import { ownerLabel, publicError } from "./utils";

type Ref<T> = { current: T };

export type HostLobbyRefs = {
  mounted: Ref<boolean>;
  connections: Ref<Map<string, DataConnection>>;
  seats: Ref<Map<string, Owner>>;
  aiOwners: Ref<Set<Owner>>;
  forfeited: Ref<Set<string>>;
  handshakes: Ref<Set<DataConnection>>;
  started: Ref<boolean>;
  session: Ref<MultiplayerSession | null>;
};

/** Host-only room policy and connection handling. PeerLifecycle still owns resources. */
export function createHostLobbyController(options: {
  seed: string;
  lifecycle: PeerLifecycle;
  refs: HostLobbyRefs;
  setRoster: (roster: LobbyPlayer[]) => void;
  setInviteCode: (code: string) => void;
  setMode: (mode: LobbyMode) => void;
  setStatus: (status: string) => void;
  setError: (error: string) => void;
  destroyPeer: () => void;
  showBattle: (session: MultiplayerSession, seed: number) => void;
  startPeer: (credential: Credential, role: "host" | "guest", operation: number) => Promise<Peer | null>;
}) {
  const { lifecycle, refs } = options;

  const publishRoster = () => {
    const peerByOwner = new Map([...refs.seats.current.entries()].map(([peerId, owner]) => [owner, peerId]));
    const players: LobbyPlayer[] = [0, 1, 2, 3].map((value) => {
      const owner = value as Owner;
      if (owner === 0) return { owner, connected: true, host: true };
      const peerId = peerByOwner.get(owner);
      if (peerId) return {
        owner,
        peerId,
        connected: refs.connections.current.get(peerId)?.open === true,
        forfeited: refs.forfeited.current.has(peerId),
      };
      return { owner, connected: false, ai: refs.aiOwners.current.has(owner) };
    });
    options.setRoster(players);
  };

  const rejectRoomFull = (connection: DataConnection) => {
    const operation = lifecycle.operation;
    const announce = () => {
      if (!lifecycle.isCurrent(operation) || !connection.open) return;
      connection.send({ type: "room_full" });
      lifecycle.schedule(`reject:${connection.connectionId}`, () => { if (connection.open) connection.close(); }, 150);
    };
    if (connection.open) announce();
    else connection.once("open", announce);
  };

  const bindHostConnection = (connection: DataConnection, grant: string, roomSeed: number) => {
    const operation = lifecycle.operation;
    lifecycle.trackConnection(connection);
    const isCurrentConnection = () => refs.mounted.current && lifecycle.isCurrent(operation);

    connection.on("data", async (raw) => {
      if (!isCurrentConnection()) return;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const message = raw as Record<string, unknown>;
      if (message.type === "hello") {
        if (refs.handshakes.current.has(connection)) return;
        refs.handshakes.current.add(connection);
        try {
          if (!validSkirmishMatchSettings(message.settings)) {
            connection.send({ type: "incompatible" });
            throw new Error("incompatible_build");
          }
          const peerId = connection.peer;
          const knownOwner = refs.seats.current.get(peerId);
          const openUserSeat = ([1, 2, 3] as const).some((candidate) =>
            !refs.aiOwners.current.has(candidate) && ![...refs.seats.current.values()].includes(candidate),
          );
          if (refs.forfeited.current.has(peerId) || (refs.started.current && knownOwner === undefined) || (!refs.started.current && knownOwner === undefined && !openUserSeat)) {
            rejectRoomFull(connection);
            return;
          }
          const handshake = await lifecycle.request<{ valid: boolean; seed: number }>("/api/multiplayer/handshake", { hostGrant: grant, guestGrant: message.grant, guestPeerId: peerId });
          if (!isCurrentConnection()) return;
          if (!connection.open || !handshake.valid || handshake.seed !== roomSeed) throw new Error("invalid_handshake");
          let owner = knownOwner;
          if (owner === undefined) {
            const used = new Set(refs.seats.current.values());
            owner = ([1, 2, 3] as const).find((candidate) => !used.has(candidate) && !refs.aiOwners.current.has(candidate));
            if (owner === undefined || refs.started.current) {
              rejectRoomFull(connection);
              return;
            }
            refs.seats.current.set(peerId, owner);
          }
          refs.connections.current.set(peerId, connection);
          lifecycle.clearTimer(`seat:${peerId}`);
          publishRoster();
          const sender = { send: (value: unknown) => { if (connection.open) connection.send(value); } };
          const current = refs.session.current;
          if (refs.started.current && current) {
            if (!current.reconnectGuest(peerId, sender)) throw new Error("room_full");
            // Re-send the roster for a tab that was reloaded while the match
            // was running. Existing guests ignore this start frame; a fresh
            // tab uses it to recreate its session before requesting a snapshot.
            connection.send({ type: "start", seed: roomSeed, settings: SKIRMISH_MATCH_SETTINGS,
              owner, owners: current.owners, aiOwners: current.aiOwners, reconnect: true });
            connection.send({ type: "reconnected" });
            options.setStatus("Guest reconnected. Resynchronizing the match.");
          } else {
            connection.send({ type: "seat", owner });
            options.setStatus(`${ownerLabel(owner)} joined. Start when at least two players are connected.`);
          }
        } catch (handshakeError) {
          if (!isCurrentConnection()) return;
          options.setError(publicError(handshakeError));
          if (handshakeError instanceof Error && handshakeError.message === "incompatible_build") {
            lifecycle.schedule(`reject:${connection.connectionId}`, () => { if (connection.open) connection.close(); }, 150);
          } else if (connection.open) connection.close();
        } finally {
          refs.handshakes.current.delete(connection);
        }
        return;
      }
      refs.session.current?.receiveFrom(connection.peer, raw);
    });

    connection.on("error", () => {
      if (!isCurrentConnection()) return;
      const activeConnection = refs.connections.current.get(connection.peer);
      if (activeConnection && activeConnection !== connection) return;
      const current = refs.session.current;
      if (refs.started.current && current && current.status !== "ended") {
        current.disconnectGuest(connection.peer);
        options.setStatus("A player connection encountered a network error. The match is paused while they reconnect.");
        connection.close();
      } else {
        options.setError("A player connection encountered a network error.");
      }
    });
    connection.on("close", () => {
      if (!isCurrentConnection()) return;
      if (refs.handshakes.current.has(connection)) refs.handshakes.current.delete(connection);
      if (refs.connections.current.get(connection.peer) !== connection) return;
      refs.connections.current.delete(connection.peer);
      publishRoster();
      const peerId = connection.peer;
      const current = refs.session.current;
      if (refs.started.current && current) {
        current.disconnectGuest(peerId);
        options.setStatus("A player disconnected. The match is paused while they reconnect (60 seconds).");
      } else {
        options.setStatus("A player disconnected. Their seat is reserved for 60 seconds.");
      }
      lifecycle.schedule(`seat:${peerId}`, () => {
        if (refs.connections.current.has(peerId)) return;
        if (refs.started.current && current) {
          const owner = current.forfeitGuest(peerId);
          if (owner !== null) {
            refs.forfeited.current.add(peerId);
            options.setStatus(`${ownerLabel(owner)} forfeited after disconnecting. The remaining match resumes.`);
          }
        } else {
          refs.seats.current.delete(peerId);
          options.setStatus("A disconnected lobby seat was released.");
        }
        publishRoster();
      }, 60_000);
    });
  };

  const hostRoom = async () => {
    const parsedSeed = Number(options.seed);
    if (!/^\d{4}$/.test(options.seed) || parsedSeed < 0 || parsedSeed > 9999) {
      options.setError("Choose a four-digit match seed first.");
      return;
    }
    options.destroyPeer();
    const operation = lifecycle.operation;
    options.setInviteCode("");
    options.setRoster([{ owner: 0, connected: true, host: true }]);
    refs.aiOwners.current.clear();
    options.setMode("waiting");
    options.setError("");
    options.setStatus("Creating room…");
    try {
      const credential = await lifecycle.request<Credential>("/api/multiplayer/rooms", { seed: parsedSeed });
      if (!refs.mounted.current || !lifecycle.isCurrent(operation)) return;
      const peer = await options.startPeer(credential, "host", operation);
      if (!peer) return;
      peer.on("connection", (connection) => {
        if (!lifecycle.isCurrent(operation)) { connection.close(); return; }
        bindHostConnection(connection, credential.grant, parsedSeed);
      });
      publishRoster();
      await lifecycle.waitForOpen(peer);
      if (!refs.mounted.current || !lifecycle.isCurrent(operation) || !lifecycle.owns(peer)) return;
      options.setInviteCode(credential.code);
    } catch (createError) {
      if (!refs.mounted.current || !lifecycle.isCurrent(operation)) return;
      options.destroyPeer();
      options.setMode("hostSetup");
      options.setStatus("Room creation failed.");
      options.setError(publicError(createError));
    }
  };

  const startMatch = () => {
    if (lifecycle.role !== "host" || refs.started.current) return;
    const connected = [...refs.seats.current.entries()].filter(([peerId]) => refs.connections.current.get(peerId)?.open === true);
    const aiOwners = [...refs.aiOwners.current].sort((a, b) => a - b);
    if (connected.length + aiOwners.length < 1 || connected.length + aiOwners.length > 3) return;
    for (const peerId of [...refs.seats.current.keys()]) {
      if (connected.some(([connectedId]) => connectedId === peerId)) continue;
      lifecycle.clearTimer(`seat:${peerId}`);
      refs.seats.current.delete(peerId);
    }
    const owners: Owner[] = [0 as Owner, ...connected.map(([, owner]) => owner), ...aiOwners].sort((a, b) => a - b);
    if (owners.length < 2 || aiOwners.some((owner) => !owners.includes(owner))) return;
    const roomSeed = Number(options.seed);
    const hostSession = new MultiplayerSession("host", 0, roomSeed, { send() {} }, owners, aiOwners);
    for (const [peerId, owner] of connected) {
      const connection = refs.connections.current.get(peerId);
      if (!connection?.open || !hostSession.addGuest(peerId, owner, { send: (value) => { if (connection.open) connection.send(value); } })) return;
    }
    hostSession.armIntroBarrier();
    refs.started.current = true;
    refs.session.current = hostSession;
    for (const [peerId, owner] of connected) {
      refs.connections.current.get(peerId)?.send({ type: "start", seed: roomSeed, settings: SKIRMISH_MATCH_SETTINGS, owner, owners, aiOwners });
    }
    options.showBattle(hostSession, roomSeed);
  };

  const setSeatAi = (owner: Owner) => {
    if (owner === 0 || lifecycle.role !== "host" || refs.started.current) return;
    if ([...refs.seats.current.values()].includes(owner)) return;
    if (refs.aiOwners.current.has(owner)) refs.aiOwners.current.delete(owner);
    else refs.aiOwners.current.add(owner);
    publishRoster();
  };

  return { hostRoom, startMatch, setSeatAi };
}

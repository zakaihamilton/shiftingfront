import type { FormEvent } from "react";
import type { DataConnection, Peer } from "peerjs";
import type { Owner } from "@/lib/types";
import { MultiplayerSession, SKIRMISH_MATCH_SETTINGS, validSkirmishMatchSettings } from "@/lib/multiplayer/session";
import type { Credential, LobbyMode } from "./types";
import { PeerLifecycle } from "./peerLifecycle";
import { ownerLabel, publicError, validAiOwners, validOwners } from "./utils";

type Ref<T> = { current: T };

export type GuestLobbyRefs = {
  mounted: Ref<boolean>;
  connection: Ref<DataConnection | null>;
  owner: Ref<Owner | null>;
  connecting: Ref<boolean>;
  session: Ref<MultiplayerSession | null>;
  beginConnection: Ref<(credential: Credential, peer: Peer) => void>;
};

type GuestRecoveryOptions = {
  lifecycle: PeerLifecycle;
  refs: GuestLobbyRefs;
  destroyPeer: () => void;
  setMode: (mode: LobbyMode) => void;
  setStatus: (status: string) => void;
  setError: (error: string) => void;
};

export function createGuestRecoveryAction(options: GuestRecoveryOptions) {
  const { lifecycle, refs } = options;
  return (credential: Credential, peer: Peer, delayMs = 1800) => {
    lifecycle.retryGuest(credential, peer, {
      canRetry: () => refs.mounted.current && !refs.connection.current?.open && refs.session.current?.status !== "ended",
      connect: () => {
        const previous = refs.connection.current;
        refs.connection.current = null;
        refs.connecting.current = false;
        previous?.close();
        refs.beginConnection.current(credential, peer);
      },
      expired: () => {
        refs.connecting.current = false;
        if (refs.session.current && refs.session.current.status !== "ended") {
          refs.session.current.end();
          options.destroyPeer();
          options.setStatus("The host did not reconnect. The skirmish has ended.");
        } else {
          options.destroyPeer();
          options.setMode("choose");
          options.setError("The host could not be reached. Ask them to create a new room.");
        }
      },
    }, delayMs);
  };
}

/** Guest join, seat/start messages, and host reconnect handling. */
export function createGuestLobbyController(options: {
  joinCode: string;
  lifecycle: PeerLifecycle;
  refs: GuestLobbyRefs;
  setMode: (mode: LobbyMode) => void;
  setStatus: (status: string) => void;
  setError: (error: string) => void;
  setGuestOwner: (owner: Owner | null) => void;
  setSession: (session: MultiplayerSession | null) => void;
  destroyPeer: () => void;
  showBattle: (session: MultiplayerSession, seed: number) => void;
  startPeer: (credential: Credential, role: "host" | "guest", operation: number) => Promise<Peer | null>;
  scheduleGuestRetry: (credential: Credential, peer: Peer, delayMs?: number) => void;
}) {
  const { lifecycle, refs } = options;

  const beginGuestConnection = (credential: Credential, peer: Peer) => {
    if (!refs.mounted.current || !lifecycle.owns(peer) || peer.disconnected || refs.connecting.current ||
        refs.connection.current?.open || refs.session.current?.status === "ended") return;
    refs.connecting.current = true;
    const connection = peer.connect(credential.hostPeerId, { reliable: true });
    refs.connection.current = connection;
    lifecycle.trackConnection(connection);
    const operation = lifecycle.operation;
    const isCurrentConnection = () => refs.mounted.current && lifecycle.isCurrent(operation) && refs.connection.current === connection;
    connection.on("data", (raw) => {
      if (!isCurrentConnection()) return;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const message = raw as Record<string, unknown>;
      if (message.type === "incompatible") {
        options.setError("Game versions differ. Reload or update both players before joining.");
        refs.session.current?.end();
        refs.session.current = null;
        options.setSession(null);
        lifecycle.finishGuestRecovery();
        options.destroyPeer();
        options.setMode("choose");
        return;
      }
      if (message.type === "room_full") {
        lifecycle.finishGuestRecovery();
        refs.connecting.current = false;
        if (refs.connection.current === connection) refs.connection.current = null;
        options.destroyPeer();
        options.setMode("choose");
        options.setStatus("This room is full or has already started.");
        options.setError(publicError(new Error("room_full")));
        return;
      }
      if (message.type === "seat" && Number.isInteger(message.owner) && Number(message.owner) >= 1 && Number(message.owner) <= 3) {
        const owner = Number(message.owner) as Owner;
        refs.owner.current = owner;
        options.setGuestOwner(owner);
        lifecycle.finishGuestRecovery();
        options.setMode("waiting");
        options.setStatus(`${ownerLabel(owner)} is reserved. Waiting for the host to start.`);
        return;
      }
      if (message.type === "start" && !refs.session.current) {
        const seedValue = Number(message.seed);
        const owner = message.owner;
        if (!Number.isInteger(message.seed) || seedValue < 0 || seedValue > 9999 ||
            !validSkirmishMatchSettings(message.settings) || (owner !== 1 && owner !== 2 && owner !== 3) ||
            !validOwners(message.owners, owner) || !validAiOwners(message.aiOwners, message.owners, owner)) {
          options.setError("The host sent incompatible match settings.");
          connection.close();
          return;
        }
        const sender = { send: (value: unknown) => { if (connection.open) connection.send(value); } };
        const next = new MultiplayerSession("guest", owner, seedValue, sender, message.owners, message.aiOwners);
        next.armIntroBarrier();
        if (message.reconnect === true) {
          next.receive({ type: "intro-release", protocolVersion: SKIRMISH_MATCH_SETTINGS.protocolVersion });
        }
        refs.owner.current = owner;
        options.setGuestOwner(owner);
        lifecycle.finishGuestRecovery();
        options.showBattle(next, seedValue);
        return;
      }
      if (message.type === "reconnected") {
        lifecycle.finishGuestRecovery();
        refs.session.current?.attach({ send: (value: unknown) => { if (connection.open) connection.send(value); } });
        connection.send({ type: "resume" });
        options.setStatus("Reconnected. Resynchronizing the match.");
        return;
      }
      refs.session.current?.receive(raw);
    });
    connection.on("open", () => {
      if (!isCurrentConnection()) {
        connection.close();
        return;
      }
      refs.connecting.current = false;
      connection.send({ type: "hello", grant: credential.grant, settings: SKIRMISH_MATCH_SETTINGS });
    });
    connection.on("close", () => {
      if (!isCurrentConnection()) return;
      refs.connection.current = null;
      refs.connecting.current = false;
      lifecycle.beginGuestRecovery();
      if (refs.session.current && refs.session.current.status !== "ended") {
        refs.session.current.setDisconnected();
        options.setStatus("Host connection lost. Reconnecting for 60 seconds…");
        lifecycle.clearTimer("guest-disconnect");
        lifecycle.schedule("guest-disconnect", () => {
          if (refs.session.current?.status === "disconnected") {
            refs.session.current.end();
            options.setStatus("The host left. The skirmish has ended.");
          }
        }, Math.max(0, lifecycle.guestRetryUntil - Date.now()));
      } else {
        options.setStatus("Host connection lost. Retrying for 60 seconds…");
      }
      options.scheduleGuestRetry(credential, peer, 1200);
    });
    connection.on("error", () => {
      if (!isCurrentConnection()) return;
      refs.connecting.current = false;
      const current = refs.session.current;
      if (current && current.status !== "ended") {
        current.setDisconnected();
        options.setStatus("The host data connection encountered a network error. Reconnecting…");
      } else {
        options.setStatus("Connecting to host…");
      }
      connection.close();
      options.scheduleGuestRetry(credential, peer);
    });
  };

  const joinRoom = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = options.joinCode.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z]{6}$/.test(normalized)) {
      options.setError("Enter the host’s six-letter code.");
      return;
    }
    options.destroyPeer();
    const operation = lifecycle.operation;
    options.setMode("joining");
    options.setError("");
    options.setStatus("Looking up room…");
    try {
      const credential = await lifecycle.request<Credential>("/api/multiplayer/rooms/join", { code: normalized });
      if (!refs.mounted.current || !lifecycle.isCurrent(operation)) return;
      lifecycle.beginGuestRecovery();
      options.setStatus("Connecting to host…");
      const peer = await options.startPeer(credential, "guest", operation);
      if (!peer) return;
      const waitForOpen = () => {
        if (peer.open) beginGuestConnection(credential, peer);
        else peer.once("open", () => beginGuestConnection(credential, peer));
      };
      waitForOpen();
    } catch (joinError) {
      if (!refs.mounted.current || !lifecycle.isCurrent(operation)) return;
      options.setMode("choose");
      options.setStatus("Room lookup failed.");
      options.setError(publicError(joinError));
    }
  };

  return { beginGuestConnection, joinRoom };
}

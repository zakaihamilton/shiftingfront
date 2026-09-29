import type { DataConnection, Peer } from "peerjs";
import type { Credential } from "./types";

type Role = "host" | "guest";
type RefreshedCredential = Pick<Credential, "peerToken" | "peerExpiresAt" | "iceServers">;
export type PeerLifecycleDependencies = {
  createPeer: (credential: Credential) => Promise<Peer>;
  request: <T>(url: string, body: unknown, signal: AbortSignal) => Promise<T>;
  now: () => number;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (timer: number) => void;
};
export type PeerLifecycleCallbacks = {
  error: (error: Error) => void;
  unavailable: () => void;
  disconnected: () => void;
  open: () => void;
  expired: () => void;
};
type GuestRetryCallbacks = {
  canRetry: () => boolean;
  connect: () => void;
  expired: () => void;
};

/** Owns resources for one room operation; the controller owns seats and UI. */
export class PeerLifecycle {
  peer: Peer | null = null;
  role: Role | null = null;
  guestRetryUntil = 0;
  private generation = 0;
  private signalingRetryUntil = 0;
  private readonly requests = new Set<AbortController>();
  private readonly timers = new Map<string, number>();
  private readonly connections = new Map<DataConnection, () => void>();
  private readonly listeners: (() => void)[] = [];

  constructor(private readonly dependencies: PeerLifecycleDependencies) {}

  get operation(): number { return this.generation; }
  isCurrent(operation: number): boolean { return operation === this.generation; }
  owns(peer: Peer): boolean { return this.peer === peer; }

  async request<T>(url: string, body: unknown): Promise<T> {
    const abort = new AbortController();
    this.requests.add(abort);
    try {
      return await this.dependencies.request<T>(url, body, abort.signal);
    } finally {
      this.requests.delete(abort);
    }
  }

  clearTimer(key: string): void {
    const timer = this.timers.get(key);
    if (timer !== undefined) this.dependencies.clearTimeout(timer);
    this.timers.delete(key);
  }

  schedule(key: string, callback: () => void, delay: number): void {
    this.clearTimer(key);
    const operation = this.operation;
    const timer = this.dependencies.setTimeout(() => {
      if (!this.isCurrent(operation) || this.timers.get(key) !== timer) return;
      this.timers.delete(key);
      callback();
    }, delay);
    this.timers.set(key, timer);
  }

  trackConnection(connection: DataConnection): void {
    if (this.connections.has(connection)) return;
    const onClose = () => { this.connections.delete(connection); };
    this.connections.set(connection, () => connection.off("close", onClose));
    connection.once("close", onClose);
  }

  beginGuestRecovery(): void {
    this.guestRetryUntil = this.dependencies.now() + 60_000;
  }

  finishGuestRecovery(): void {
    this.guestRetryUntil = 0;
    this.clearTimer("guest-retry");
  }

  async refreshCredential(credential: Credential, peer: Peer): Promise<boolean> {
    const operation = this.operation;
    const refreshed = await this.request<RefreshedCredential>("/api/multiplayer/peer-credentials", { grant: credential.grant });
    if (!this.isCurrent(operation) || !this.owns(peer)) return false;
    credential.peerToken = refreshed.peerToken;
    credential.peerExpiresAt = refreshed.peerExpiresAt;
    credential.iceServers = refreshed.iceServers;
    peer.options.token = refreshed.peerToken;
    peer.options.config = { iceServers: refreshed.iceServers };
    return true;
  }

  retryGuest(credential: Credential, peer: Peer, callbacks: GuestRetryCallbacks, delay = 1800): void {
    if (!this.owns(peer)) return;
    if (!this.guestRetryUntil) this.beginGuestRecovery();
    if (this.dependencies.now() >= this.guestRetryUntil) {
      callbacks.expired();
      return;
    }
    this.schedule("guest-retry", () => {
      if (!this.owns(peer) || peer.disconnected || !callbacks.canRetry()) return;
      void this.prepareGuestRetry(credential, peer, callbacks);
    }, delay);
  }

  private async prepareGuestRetry(credential: Credential, peer: Peer, callbacks: GuestRetryCallbacks): Promise<void> {
    const operation = this.operation;
    try {
      if (credential.peerExpiresAt * 1000 < this.dependencies.now() + 30_000 &&
          !await this.refreshCredential(credential, peer)) return;
      if (this.isCurrent(operation) && this.owns(peer) && !peer.disconnected && callbacks.canRetry()) callbacks.connect();
    } catch {
      if (this.isCurrent(operation) && this.owns(peer)) this.retryGuest(credential, peer, callbacks);
    }
  }

  async start(credential: Credential, role: Role, operation: number, callbacks: PeerLifecycleCallbacks): Promise<Peer | null> {
    const peer = await this.dependencies.createPeer(credential);
    if (!this.isCurrent(operation)) { peer.destroy(); return null; }
    this.peer = peer;
    this.role = role;
    const current = () => this.isCurrent(operation) && this.owns(peer);
    const onError = (error: Error & { type?: string }) => {
      if (!current()) return;
      callbacks.error(error);
      if (error.type === "peer-unavailable" && role === "guest") callbacks.unavailable();
    };
    const onDisconnected = () => {
      if (!current()) return;
      callbacks.disconnected();
      this.signalingRetryUntil = this.dependencies.now() + 60_000;
      const retry = async () => {
        if (!current()) return;
        if (this.dependencies.now() >= this.signalingRetryUntil) { callbacks.expired(); return; }
        if (!peer.disconnected) return;
        try {
          if (credential.peerExpiresAt * 1000 < this.dependencies.now() + 30_000 &&
              !await this.refreshCredential(credential, peer)) return;
          if (!current() || !peer.disconnected) return;
          peer.reconnect();
        } catch {
          // A failed refresh consumes the same recovery window as signaling.
        }
        if (current() && peer.disconnected) this.schedule("signaling-retry", () => { void retry(); }, 1800);
      };
      this.schedule("signaling-retry", () => { void retry(); }, 0);
    };
    const onOpen = () => {
      if (!current()) return;
      this.signalingRetryUntil = 0;
      this.clearTimer("signaling-retry");
      callbacks.open();
    };
    peer.on("error", onError);
    peer.on("disconnected", onDisconnected);
    peer.on("open", onOpen);
    this.listeners.push(() => {
      peer.off("error", onError);
      peer.off("disconnected", onDisconnected);
      peer.off("open", onOpen);
    });
    return peer;
  }

  waitForOpen(peer: Peer, timeout = 15_000): Promise<void> {
    if (peer.open) return Promise.resolve();
    const abort = new AbortController();
    this.requests.add(abort);
    return new Promise((resolve, reject) => {
      const timer = this.dependencies.setTimeout(() => finish(new Error("peer_open_timeout")), timeout);
      const onOpen = () => finish();
      const onError = (error: Error) => finish(error);
      const onAbort = () => finish(new Error("peer_open_aborted"));
      const finish = (error?: Error) => {
        this.dependencies.clearTimeout(timer);
        this.requests.delete(abort);
        peer.off("open", onOpen);
        peer.off("error", onError);
        abort.signal.removeEventListener("abort", onAbort);
        if (error) reject(error); else resolve();
      };
      abort.signal.addEventListener("abort", onAbort, { once: true });
      peer.on("open", onOpen);
      peer.on("error", onError);
    });
  }

  dispose(): void {
    // Invalidate before close/destroy, which can synchronously emit events.
    this.generation += 1;
    const peer = this.peer;
    this.peer = null;
    this.role = null;
    for (const abort of this.requests) abort.abort();
    this.requests.clear();
    for (const key of this.timers.keys()) this.clearTimer(key);
    for (const remove of this.listeners.splice(0)) remove();
    const connections = [...this.connections.entries()];
    this.connections.clear();
    for (const [connection, remove] of connections) { remove(); connection.close(); }
    peer?.destroy();
    this.guestRetryUntil = 0;
    this.signalingRetryUntil = 0;
  }
}

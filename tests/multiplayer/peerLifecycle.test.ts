import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataConnection, Peer } from "peerjs";
import { PeerLifecycle, type PeerLifecycleCallbacks } from "@/components/multiplayer/lobby/peerLifecycle";
import type { Credential } from "@/components/multiplayer/lobby/types";
import { createGuestLobbyController, createGuestRecoveryAction, type GuestLobbyRefs } from "@/components/multiplayer/lobby/guestController";
import { MultiplayerSession } from "@/lib/multiplayer/session";

class FakePeer extends EventEmitter {
  open = false;
  disconnected = false;
  options = { token: "old", config: { iceServers: [] as RTCIceServer[] } };
  destroy = vi.fn(() => this.emit("close"));
  reconnect = vi.fn();
  connect = vi.fn(() => new FakeConnection().connection);
  get peer(): Peer { return this as unknown as Peer; }
}
class FakeConnection extends EventEmitter {
  open = false;
  send = vi.fn();
  close = vi.fn(() => this.emit("close"));
  get connection(): DataConnection { return this as unknown as DataConnection; }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function credential(): Credential {
  return {
    code: "ABCDEF", hostPeerId: "host", peerId: "guest", grant: "grant", expiresAt: 999999,
    peerJs: { host: "localhost", port: 443, path: "/", key: "key", secure: true },
    peerToken: "old", peerExpiresAt: 999999, iceServers: [],
  };
}
function fixture() {
  const peer = new FakePeer();
  const createPeer = vi.fn(async () => peer.peer);
  const request = vi.fn<(url: string, body: unknown, signal: AbortSignal) => Promise<unknown>>(async () => ({
    peerToken: "new", peerExpiresAt: 999999, iceServers: [{ urls: "stun:example.test" }],
  }));
  const lifecycle = new PeerLifecycle({
    createPeer,
    request: <T>(url: string, body: unknown, signal: AbortSignal) => request(url, body, signal) as Promise<T>,
    now: () => Date.now(),
    setTimeout: (callback, delay) => setTimeout(callback, delay) as unknown as number,
    clearTimeout: (timer) => clearTimeout(timer),
  });
  const callbacks: PeerLifecycleCallbacks = {
    error: vi.fn(), unavailable: vi.fn(), disconnected: vi.fn(), open: vi.fn(), expired: vi.fn(),
  };
  return { peer, lifecycle, callbacks, createPeer, request };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); });
afterEach(() => { vi.useRealTimers(); });

describe("room peer lifecycle", () => {
  it("cancels requests, open waits, connections, and timers on repeated disposal", async () => {
    const { peer, lifecycle, callbacks, request } = fixture();
    await lifecycle.start(credential(), "guest", lifecycle.operation, callbacks);
    const pending = deferred<unknown>();
    request.mockImplementationOnce(() => pending.promise);
    const fetching = lifecycle.request("/room", {});
    const opening = lifecycle.waitForOpen(peer.peer).catch((error: Error) => error.message);
    const connection = new FakeConnection();
    lifecycle.trackConnection(connection.connection);
    const timeout = vi.fn();
    lifecycle.schedule("retry", timeout, 100);
    lifecycle.dispose();
    lifecycle.dispose();
    expect(request.mock.calls[0][2].aborted).toBe(true);
    expect(await opening).toBe("peer_open_aborted");
    pending.resolve({});
    await fetching;
    await vi.runAllTimersAsync();
    expect(timeout).not.toHaveBeenCalled();
    expect(peer.destroy).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(peer.listenerCount("open")).toBe(0);
    expect(peer.listenerCount("error")).toBe(0);
  });

  it("destroys a peer whose asynchronous creation finishes after cancellation", async () => {
    const { peer, lifecycle, callbacks, createPeer } = fixture();
    const pending = deferred<Peer>();
    createPeer.mockReturnValueOnce(pending.promise);
    const starting = lifecycle.start(credential(), "guest", lifecycle.operation, callbacks);
    lifecycle.dispose();
    pending.resolve(peer.peer);
    expect(await starting).toBeNull();
    expect(peer.destroy).toHaveBeenCalledOnce();
    expect(lifecycle.peer).toBeNull();
    expect(callbacks.open).not.toHaveBeenCalled();
  });

  it("does not apply stale credential refreshes or callbacks to a new room", async () => {
    const { peer, lifecycle, callbacks, createPeer, request } = fixture();
    const oldCredential = credential();
    await lifecycle.start(oldCredential, "guest", lifecycle.operation, callbacks);
    const pending = deferred<unknown>();
    request.mockReturnValueOnce(pending.promise);
    const refresh = lifecycle.refreshCredential(oldCredential, peer.peer);
    const oldOpen = peer.listeners("open")[0];
    lifecycle.dispose();
    const replacement = new FakePeer();
    createPeer.mockResolvedValueOnce(replacement.peer);
    await lifecycle.start(credential(), "host", lifecycle.operation, callbacks);
    pending.resolve({ peerToken: "stale", peerExpiresAt: 999999, iceServers: [] });
    expect(await refresh).toBe(false);
    oldOpen();
    expect(oldCredential.peerToken).toBe("old");
    expect(replacement.options.token).toBe("old");
    expect(callbacks.open).not.toHaveBeenCalled();
    lifecycle.dispose();
  });

  it("retries failed signaling refreshes and recovers within the same deadline", async () => {
    const { peer, lifecycle, callbacks, request } = fixture();
    const expiredCredential = { ...credential(), peerExpiresAt: 0 };
    await lifecycle.start(expiredCredential, "host", lifecycle.operation, callbacks);
    request.mockRejectedValueOnce(new Error("offline"));
    peer.disconnected = true;
    peer.emit("disconnected");
    await vi.advanceTimersByTimeAsync(0);
    expect(peer.reconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1800);
    expect(peer.reconnect).toHaveBeenCalledOnce();
    expect(peer.options.token).toBe("new");
    peer.disconnected = false;
    peer.open = true;
    peer.emit("open");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(callbacks.open).toHaveBeenCalledOnce();
    expect(callbacks.expired).not.toHaveBeenCalled();
    lifecycle.dispose();
  });

  it("expires signaling recovery after 60 seconds", async () => {
    const { peer, lifecycle, callbacks } = fixture();
    await lifecycle.start(credential(), "host", lifecycle.operation, callbacks);
    peer.disconnected = true;
    peer.emit("disconnected");
    await vi.advanceTimersByTimeAsync(61_200);
    expect(callbacks.disconnected).toHaveBeenCalledOnce();
    expect(callbacks.expired).toHaveBeenCalledOnce();
    lifecycle.dispose();
  });

  it("keeps negotiation errors separate from signaling recovery", async () => {
    const { peer, lifecycle, callbacks } = fixture();
    await lifecycle.start(credential(), "guest", lifecycle.operation, callbacks);
    peer.emit("error", Object.assign(new Error("unavailable"), { type: "peer-unavailable" }));
    expect(callbacks.error).toHaveBeenCalledOnce();
    expect(callbacks.unavailable).toHaveBeenCalledOnce();
    expect(callbacks.disconnected).not.toHaveBeenCalled();
    lifecycle.dispose();
  });

  it("retries guest refresh failure and stops when a connection recovers", async () => {
    const { peer, lifecycle, callbacks, request } = fixture();
    const expiredCredential = { ...credential(), peerExpiresAt: 0 };
    await lifecycle.start(expiredCredential, "guest", lifecycle.operation, callbacks);
    request.mockRejectedValueOnce(new Error("offline"));
    let connected = false;
    const retry = { canRetry: () => !connected, connect: vi.fn(), expired: vi.fn() };
    lifecycle.retryGuest(expiredCredential, peer.peer, retry, 1200);
    await vi.advanceTimersByTimeAsync(1200);
    expect(retry.connect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1800);
    expect(retry.connect).toHaveBeenCalledOnce();
    lifecycle.retryGuest(expiredCredential, peer.peer, retry);
    connected = true;
    lifecycle.finishGuestRecovery();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(retry.connect).toHaveBeenCalledOnce();
    expect(retry.expired).not.toHaveBeenCalled();
    lifecycle.dispose();
  });

  it("does not reconnect an old guest after a delayed refresh finishes", async () => {
    const { peer, lifecycle, callbacks, request } = fixture();
    const expiredCredential = { ...credential(), peerExpiresAt: 0 };
    await lifecycle.start(expiredCredential, "guest", lifecycle.operation, callbacks);
    const pending = deferred<unknown>();
    request.mockReturnValueOnce(pending.promise);
    const retry = { canRetry: () => true, connect: vi.fn(), expired: vi.fn() };
    lifecycle.retryGuest(expiredCredential, peer.peer, retry, 1200);
    await vi.advanceTimersByTimeAsync(1200);
    lifecycle.dispose();
    pending.resolve({ peerToken: "stale", peerExpiresAt: 999999, iceServers: [] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(retry.connect).not.toHaveBeenCalled();
    expect(retry.expired).not.toHaveBeenCalled();
  });

  it.each([false, true])("does not expire a recovered guest after a pending refresh settles (failed=%s)", async (failed) => {
    const { peer, lifecycle, callbacks, request } = fixture();
    const ticket = { ...credential(), peerExpiresAt: 0 };
    await lifecycle.start(ticket, "guest", lifecycle.operation, callbacks);
    const pending = deferred<unknown>();
    request.mockReturnValueOnce(pending.promise);
    const retry = { canRetry: () => true, connect: vi.fn(), expired: vi.fn() };
    lifecycle.retryGuest(ticket, peer.peer, retry, 1200);
    await vi.advanceTimersByTimeAsync(1200);
    lifecycle.finishGuestRecovery();
    if (failed) pending.reject(new Error("offline"));
    else pending.resolve({ peerToken: "new", peerExpiresAt: 999999, iceServers: [] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(retry.connect).not.toHaveBeenCalled();
    expect(retry.expired).not.toHaveBeenCalled();
    lifecycle.dispose();
  });

  it("expires guest retries at the original recovery deadline", async () => {
    const { peer, lifecycle, callbacks, request } = fixture();
    await lifecycle.start({ ...credential(), peerExpiresAt: 0 }, "guest", lifecycle.operation, callbacks);
    request.mockRejectedValue(new Error("offline"));
    const retry = { canRetry: () => true, connect: vi.fn(), expired: vi.fn() };
    lifecycle.retryGuest({ ...credential(), peerExpiresAt: 0 }, peer.peer, retry);
    await vi.advanceTimersByTimeAsync(61_200);
    expect(retry.expired).toHaveBeenCalledOnce();
    expect(retry.connect).not.toHaveBeenCalled();
    lifecycle.dispose();
  });

  it.each([false, true])("expires repeated failed guest connections at the first disconnect deadline (match=%s)", async (inMatch) => {
    const { peer, lifecycle, callbacks } = fixture();
    const ticket = credential();
    await lifecycle.start(ticket, "guest", lifecycle.operation, callbacks);
    const session = inMatch ? new MultiplayerSession("guest", 1, 421, { send() {} }) : null;
    const refs: GuestLobbyRefs = {
      mounted: { current: true }, connection: { current: null }, owner: { current: null },
      connecting: { current: false }, session: { current: session }, beginConnection: { current: () => undefined },
    };
    const options = {
      lifecycle, refs, destroyPeer: vi.fn(() => lifecycle.dispose()), setMode: vi.fn(),
      setStatus: vi.fn(), setError: vi.fn(),
    };
    const recovery = createGuestRecoveryAction(options);
    const controller = createGuestLobbyController({
      ...options, joinCode: ticket.code, setGuestOwner: vi.fn(), setSession: vi.fn(), showBattle: vi.fn(),
      startPeer: async () => peer.peer, scheduleGuestRetry: recovery,
    });
    refs.beginConnection.current = controller.beginGuestConnection;
    controller.beginGuestConnection(ticket, peer.peer);
    refs.connection.current!.close();
    const deadline = lifecycle.guestRetryUntil;
    for (let attempt = 0; attempt < 2; attempt++) {
      await vi.advanceTimersByTimeAsync(20_000);
      refs.connection.current!.close();
      expect(lifecycle.guestRetryUntil).toBe(deadline);
    }
    await vi.advanceTimersByTimeAsync(20_000);
    if (inMatch) expect(session!.status).toBe("ended");
    else {
      expect(options.destroyPeer).toHaveBeenCalledOnce();
      expect(options.setMode).toHaveBeenCalledWith("choose");
    }
    lifecycle.dispose();
  });

  it("starts a new guest recovery window only after the previous connection is accepted", async () => {
    const { lifecycle, callbacks } = fixture();
    await lifecycle.start(credential(), "guest", lifecycle.operation, callbacks);
    lifecycle.beginGuestRecovery();
    const firstDeadline = lifecycle.guestRetryUntil;
    await vi.advanceTimersByTimeAsync(20_000);
    lifecycle.beginGuestRecovery();
    expect(lifecycle.guestRetryUntil).toBe(firstDeadline);
    lifecycle.finishGuestRecovery();
    lifecycle.beginGuestRecovery();
    expect(lifecycle.guestRetryUntil).toBe(firstDeadline + 20_000);
    lifecycle.dispose();
  });
});

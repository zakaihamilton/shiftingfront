import { expect, test } from "@playwright/test";
import { skipMissionIntroIfPresent } from "./missionIntro";

const roomCode = "ABCDEF";
const hostPeerId = "host-peer-e2e";
const guestPeerIds = ["guest-peer-1-e2e", "guest-peer-2-e2e", "guest-peer-3-e2e"];

async function mockPeerTransport(page: import("@playwright/test").Page, networkId: string, openDelayMs = 0) {
  await page.addInitScript(({ channelName, openDelay }) => {
    type Listener = (...args: unknown[]) => void;
    class Events {
      private listeners = new Map<string, Set<Listener>>();
      on(event: string, listener: Listener) {
        const set = this.listeners.get(event) ?? new Set<Listener>();
        set.add(listener);
        this.listeners.set(event, set);
        return this;
      }
      once(event: string, listener: Listener) {
        const wrapped: Listener = (...args) => {
          this.off(event, wrapped);
          listener(...args);
        };
        return this.on(event, wrapped);
      }
      off(event: string, listener: Listener) {
        this.listeners.get(event)?.delete(listener);
        return this;
      }
      emit(event: string, ...args: unknown[]) {
        for (const listener of this.listeners.get(event) ?? []) listener(...args);
      }
    }

    class FakeConnection extends Events {
      open = false;
      constructor(readonly peer: string, readonly peerId: string, readonly id: string, private readonly channel: BroadcastChannel) { super(); }
      send(data: unknown) {
        if (!this.open) throw new Error("Mock data connection is closed");
        this.channel.postMessage({ kind: "data", to: this.peer, from: this.peerId, id: this.id, data });
      }
      close() {
        if (!this.open) return;
        this.open = false;
        this.channel.postMessage({ kind: "close", to: this.peer, from: this.peerId, id: this.id });
        this.emit("close");
      }
    }

    class FakePeer extends Events {
      open = false;
      disconnected = false;
      options: { token?: string; config?: RTCConfiguration };
      connections: Record<string, FakeConnection[]> = {};
      private channel = new BroadcastChannel(channelName);
      constructor(readonly id: string, options: { token?: string; config?: RTCConfiguration }) {
        super();
        this.options = options;
        this.channel.onmessage = ({ data }) => {
          if (!data || data.to !== this.id) return;
          if (data.kind === "connect") {
            const connection = new FakeConnection(data.from, this.id, data.id, this.channel);
            connection.open = true;
            this.connections[data.from] = [connection];
            this.emit("connection", connection);
            this.channel.postMessage({ kind: "ready", to: data.from, from: this.id, id: data.id });
          } else if (data.kind === "ready") {
            const connection = this.connections[data.from]?.find((item) => item.id === data.id);
            if (connection) {
              connection.open = true;
              connection.emit("open");
            }
          } else if (data.kind === "data") {
            const connection = this.connections[data.from]?.find((item) => item.id === data.id);
            connection?.emit("data", data.data);
          } else if (data.kind === "close") {
            const connection = this.connections[data.from]?.find((item) => item.id === data.id);
            if (connection) {
              connection.open = false;
              connection.emit("close");
            }
          }
        };
        window.setTimeout(() => {
          this.open = true;
          this.emit("open", this.id);
        }, openDelay);
      }
      connect(peerId: string) {
        const connection = new FakeConnection(peerId, this.id, `${this.id}:${peerId}`, this.channel);
        this.connections[peerId] = [connection];
        this.channel.postMessage({ kind: "connect", to: peerId, from: this.id, id: connection.id });
        return connection;
      }
      reconnect() {
        // Keep the simulated signaling outage active until the test restores it.
      }
      restoreSignaling() {
        this.disconnected = false;
        this.open = true;
        this.emit("open", this.id);
      }
      disconnect() {
        this.disconnected = true;
        this.open = false;
        this.emit("disconnected", this.id);
      }
      destroy() {
        this.channel.close();
      }
    }

    const testWindow = window as Window & { __SHIFTFRONT_TEST_PEERS__?: FakePeer[] };
    testWindow.__SHIFTFRONT_TEST_PEERS__ = [];
    const PeerForTest = class extends FakePeer {
      constructor(id: string, options: { token?: string; config?: RTCConfiguration }) {
        super(id, options);
        testWindow.__SHIFTFRONT_TEST_PEERS__?.push(this);
      }
    };
    Object.defineProperty(window, "__SHIFTFRONT_PEER_FACTORY__", { value: () => PeerForTest, configurable: true });
  }, { channelName: networkId, openDelay: openDelayMs });
}

async function mockPeerovo(page: import("@playwright/test").Page, role: "host" | "guest", guestId = guestPeerIds[0]) {
  await page.route("**/api/multiplayer/rooms", async (route) => {
    const request = route.request().postDataJSON() as { seed: number };
    await route.fulfill({ json: {
      code: roomCode,
      seed: request.seed,
      hostPeerId,
      peerId: hostPeerId,
      grant: "host-room-grant",
      expiresAt: Date.now() + 3_600_000,
      peerJs: { host: "signal.mock.test", port: 443, path: "/", key: "peerjs", secure: true },
      peerToken: "short-host-token",
      peerExpiresAt: Math.floor(Date.now() / 1000) + 600,
      iceServers: [],
    } });
  });
  await page.route("**/api/multiplayer/rooms/join", async (route) => {
    await route.fulfill({ json: {
      code: roomCode,
      hostPeerId,
      peerId: guestId,
      grant: "guest-room-grant",
      expiresAt: Date.now() + 3_600_000,
      peerJs: { host: "signal.mock.test", port: 443, path: "/", key: "peerjs", secure: true },
      peerToken: "short-guest-token",
      peerExpiresAt: Math.floor(Date.now() / 1000) + 600,
      iceServers: [],
    } });
  });
  if (role === "host") {
    await page.route("**/api/multiplayer/handshake", async (route) => {
      await route.fulfill({ json: { valid: true, seed: 421 } });
    });
  }
}

test("host starts a four-player corner skirmish after three guests verify their seats", async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext();
  const host = await context.newPage();
  const guests = await Promise.all(guestPeerIds.map(() => context.newPage()));
  const networkId = `sf-multiplayer-${Date.now()}-${Math.random()}`;
  let releaseHandshake!: () => void;
  let markHandshakeStarted!: () => void;
  const handshakeGate = new Promise<void>((resolve) => { releaseHandshake = resolve; });
  const handshakeStarted = new Promise<void>((resolve) => { markHandshakeStarted = resolve; });
  await Promise.all([mockPeerTransport(host, networkId, 800), ...guests.map((guest) => mockPeerTransport(guest, networkId))]);
  await Promise.all([mockPeerovo(host, "host"), ...guests.map((guest, index) => mockPeerovo(guest, "guest", guestPeerIds[index]))]);
  await host.route("**/api/multiplayer/handshake", async (route) => {
    markHandshakeStarted();
    await handshakeGate;
    await route.fulfill({ json: { valid: true, seed: 421 } });
  });

  await host.goto("/");
  await host.getByRole("button", { name: "MULTIPLAYER" }).click();
  await host.getByRole("button", { name: "Host a room" }).click();
  await host.getByTestId("multiplayer-seed-input").fill("0421");
  await host.getByRole("button", { name: "Create room" }).click();
  await expect(host.getByTestId("multiplayer-invite-code")).toHaveText("······");
  await expect(host.getByTestId("multiplayer-invite-code")).toHaveText(roomCode);
  await expect(host.getByTestId("multiplayer-start-button")).toBeDisabled();

  const firstGuest = guests[0]!;
  await firstGuest.goto("/");
  await firstGuest.getByRole("button", { name: "MULTIPLAYER" }).click();
  await firstGuest.getByTestId("multiplayer-code-input").fill(roomCode.toLowerCase());
  await firstGuest.getByRole("button", { name: "Join room" }).click();
  await handshakeStarted;
  await expect(host.getByTestId("battlefield-canvas")).toHaveCount(0);
  await expect(firstGuest.getByTestId("battlefield-canvas")).toHaveCount(0);
  await expect(host.getByTestId("multiplayer-roster").locator("li")).toHaveCount(4);
  await expect(host.getByTestId("multiplayer-roster-seat-1")).toContainText("Open User seat");
  releaseHandshake();
  await expect(firstGuest.getByTestId("multiplayer-seat")).toContainText("Northeast");

  for (const [index, guest] of guests.slice(1).entries()) {
    await guest.goto("/");
    await guest.getByRole("button", { name: "MULTIPLAYER" }).click();
    await guest.getByTestId("multiplayer-code-input").fill(roomCode);
    await guest.getByRole("button", { name: "Join room" }).click();
    await expect(guest.getByTestId("multiplayer-seat")).toContainText(index === 0 ? "Southeast" : "Southwest");
  }

  await expect(host.getByTestId("multiplayer-roster").locator("li")).toHaveCount(4);
  await expect(host.getByTestId("multiplayer-start-button")).toBeEnabled();
  await host.getByTestId("multiplayer-start-button").click();
  const players = [host, ...guests];
  await Promise.all(players.map((page) => expect(page.getByTestId("battlefield-canvas")).toBeVisible({ timeout: 15_000 })));
  await Promise.all(players.map(skipMissionIntroIfPresent));
  await Promise.all(players.map((page) => expect(page.getByTestId("command-sidebar")).toBeVisible({ timeout: 15_000 })));

  const lateGuest = await context.newPage();
  await mockPeerTransport(lateGuest, networkId);
  await mockPeerovo(lateGuest, "guest", "late-guest-peer-e2e");
  await lateGuest.goto("/");
  await lateGuest.getByRole("button", { name: "MULTIPLAYER" }).click();
  await lateGuest.getByTestId("multiplayer-code-input").fill(roomCode);
  await lateGuest.getByRole("button", { name: "Join room" }).click();
  await expect(lateGuest.locator("p[role=alert]")).toHaveText("That room is full or has already started.");

  const hostPeerCount = await host.evaluate(() => {
    const testWindow = window as Window & { __SHIFTFRONT_TEST_PEERS__?: Array<{ id: string; disconnected: boolean; disconnect: () => void }> };
    return testWindow.__SHIFTFRONT_TEST_PEERS__?.length ?? 0;
  });
  expect(hostPeerCount).toBe(1);
  await host.evaluate(() => {
    const testWindow = window as Window & { __SHIFTFRONT_TEST_PEERS__?: Array<{ disconnect: () => void }> };
    testWindow.__SHIFTFRONT_TEST_PEERS__?.[0]?.disconnect();
  });
  await expect(host.getByText("Signaling disconnected. Reconnecting…")).toBeVisible();
  await host.evaluate(() => {
    const testWindow = window as Window & { __SHIFTFRONT_TEST_PEERS__?: Array<{ restoreSignaling: () => void }> };
    testWindow.__SHIFTFRONT_TEST_PEERS__?.[0]?.restoreSignaling();
  });
  await expect(host.getByText("Signaling disconnected. Reconnecting…")).toHaveCount(0);

  const hostSaves = await host.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("shiftingfront:save:")));
  expect(hostSaves).toEqual([]);
  for (const guest of guests) {
    const guestSaves = await guest.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("shiftingfront:save:")));
    expect(guestSaves).toEqual([]);
  }
  await host.evaluate((remotePeerId) => {
    const testWindow = window as Window & { __SHIFTFRONT_TEST_PEERS__?: Array<{ connections: Record<string, Array<{ send: (value: unknown) => void }>> }> };
    testWindow.__SHIFTFRONT_TEST_PEERS__?.[0]?.connections[remotePeerId]?.[0]?.send({ type: "ended" });
  }, guestPeerIds[2]);
  await expect(guests[2]!.getByRole("heading", { name: "Connection ended" })).toBeVisible();
  await expect(guests[2]!.getByText("The host ended the skirmish.").last()).toBeVisible();
  releaseHandshake();
  await context.close();
});

test("host can launch a skirmish against an AI opponent", async ({ browser }) => {
  const context = await browser.newContext();
  const host = await context.newPage();
  const networkId = `sf-multiplayer-ai-${Date.now()}-${Math.random()}`;
  await mockPeerTransport(host, networkId);
  await mockPeerovo(host, "host");

  await host.goto("/");
  await host.getByRole("button", { name: "MULTIPLAYER" }).click();
  await host.getByRole("button", { name: "Host a room" }).click();
  await host.getByTestId("multiplayer-seed-input").fill("0421");
  await host.getByRole("button", { name: "Create room" }).click();
  await expect(host.getByTestId("multiplayer-invite-code")).toHaveText(roomCode);
  await expect(host.getByTestId("multiplayer-start-button")).toBeDisabled();
  await host.getByTestId("multiplayer-seat-toggle-1").click();
  await expect(host.getByTestId("multiplayer-roster-seat-1")).toContainText("AI opponent");
  await expect(host.getByTestId("multiplayer-start-button")).toBeEnabled();
  await host.getByTestId("multiplayer-seat-toggle-1").click();
  await expect(host.getByTestId("multiplayer-start-button")).toBeDisabled();
  await host.getByTestId("multiplayer-seat-toggle-1").click();
  await host.getByTestId("multiplayer-start-button").click();
  await expect(host.getByTestId("battlefield-canvas")).toBeVisible({ timeout: 15_000 });
  await skipMissionIntroIfPresent(host);
  await expect(host.getByTestId("command-sidebar")).toBeVisible({ timeout: 15_000 });
  await context.close();
});

test("AI and a human guest occupy separate seats in the same skirmish", async ({ browser }) => {
  const context = await browser.newContext();
  const host = await context.newPage();
  const guest = await context.newPage();
  const networkId = `sf-multiplayer-mixed-${Date.now()}-${Math.random()}`;
  await Promise.all([mockPeerTransport(host, networkId), mockPeerTransport(guest, networkId)]);
  await Promise.all([mockPeerovo(host, "host"), mockPeerovo(guest, "guest", guestPeerIds[0])]);

  await host.goto("/");
  await host.getByRole("button", { name: "MULTIPLAYER" }).click();
  await host.getByRole("button", { name: "Host a room" }).click();
  await host.getByTestId("multiplayer-seed-input").fill("0421");
  await host.getByRole("button", { name: "Create room" }).click();
  await expect(host.getByTestId("multiplayer-invite-code")).toHaveText(roomCode);
  await host.getByTestId("multiplayer-seat-toggle-1").click();

  await guest.goto("/");
  await guest.getByRole("button", { name: "MULTIPLAYER" }).click();
  await guest.getByTestId("multiplayer-code-input").fill(roomCode);
  await guest.getByRole("button", { name: "Join room" }).click();
  await expect(guest.getByTestId("multiplayer-seat")).toContainText("Southeast");
  await expect(host.getByTestId("multiplayer-roster-seat-1")).toContainText("AI opponent");
  await expect(host.getByTestId("multiplayer-roster-seat-2")).toContainText("Connected");
  await host.getByTestId("multiplayer-start-button").click();
  await Promise.all([
    expect(host.getByTestId("battlefield-canvas")).toBeVisible({ timeout: 15_000 }),
    expect(guest.getByTestId("battlefield-canvas")).toBeVisible({ timeout: 15_000 }),
  ]);
  await Promise.all([host, guest].map(skipMissionIntroIfPresent));
  await context.close();
});

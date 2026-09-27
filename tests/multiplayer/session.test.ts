import { describe, expect, it } from "vitest";
import { MultiplayerSession, sanitizeCommand, SKIRMISH_MATCH_SETTINGS, validSkirmishMatchSettings } from "@/lib/multiplayer/session";
import { createSkirmish } from "@/lib/sim/api";
import { fogAt } from "@/lib/sim/fog";
import type { Owner } from "@/lib/types";

describe("four-player canonical multiplayer command stream", () => {
  it("assigns seats from authenticated peers and fans ordered tick frames to every guest", () => {
    const owners: Owner[] = [0, 1, 2, 3];
    const hostFrames: unknown[] = [];
    const guests = new Map<string, MultiplayerSession>();
    const host = new MultiplayerSession("host", 0, 8123, { send() {} }, owners);
    for (const owner of [1, 2, 3] as const) {
      const peerId = `guest-${owner}`;
      const guest = new MultiplayerSession("guest", owner, 8123, {
        send: (value) => host.receiveFrom(peerId, value),
      }, owners);
      guests.set(peerId, guest);
      expect(host.addGuest(peerId, owner, {
        send: (value) => { hostFrames.push({ peerId, value }); guest.receive(value); },
      })).toBe(true);
    }

    host.submit({ type: "stop", unitIds: [10] });
    guests.get("guest-3")!.submit({ type: "move", unitIds: [40], x: 31, y: 22, owner: 0 });
    guests.get("guest-1")!.submit({ type: "stop", unitIds: [20] });
    guests.get("guest-2")!.submit({ type: "stop", unitIds: [30] });
    expect(guests.get("guest-1")!.canAdvance({ tick: 0 } as never)).toBe(false);

    const commands = host.drainTick({ tick: 0 } as never, []);
    expect(hostFrames).toHaveLength(3);
    expect(hostFrames.map((frame) => (frame as { value: unknown }).value)).toEqual([
      { type: "tick", protocolVersion: 3, tick: 1, commands },
      { type: "tick", protocolVersion: 3, tick: 1, commands },
      { type: "tick", protocolVersion: 3, tick: 1, commands },
    ]);
    expect(commands).toEqual([
      { type: "stop", unitIds: [10], owner: 0 },
      { type: "move", unitIds: [40], x: 31, y: 22, owner: 3 },
      { type: "stop", unitIds: [20], owner: 1 },
      { type: "stop", unitIds: [30], owner: 2 },
    ]);
    for (const guest of guests.values()) {
      expect(guest.canAdvance({ tick: 0 } as never)).toBe(true);
      expect(guest.drainTick({ tick: 0 } as never, [])).toEqual(commands);
    }
    expect(guests.get("guest-3")!.canAdvance({ tick: 1 } as never)).toBe(false);
    host.receiveFrom("unregistered-peer", { type: "intent", command: { type: "stop", unitIds: [999] } });
    expect(host.drainTick({ tick: 1 } as never, [])).toEqual([]);
  });

  it("pauses the full room on one disconnect and reconnects the same authenticated seat", () => {
    const host = new MultiplayerSession("host", 0, 42, { send() {} }, [0, 1, 2]);
    host.addGuest("guest-1", 1, { send() {} });
    host.addGuest("guest-2", 2, { send() {} });
    host.disconnectGuest("guest-2");
    expect(host.status).toBe("disconnected");
    expect(host.canAdvance({ tick: 0 } as never)).toBe(false);
    expect(host.reconnectGuest("guest-2", { send() {} })).toBe(true);
    expect(host.status).toBe("connected");
    expect(host.addGuest("replacement-peer", 2, { send() {} })).toBe(false);
  });

  it("forfeits a timed-out guest, removes their force, and resumes remaining players", () => {
    const state = createSkirmish(42, 0, [0, 1, 2]).state;
    const host = new MultiplayerSession("host", 0, 42, { send() {} }, [0, 1, 2]);
    host.addGuest("guest-1", 1, { send() {} });
    host.addGuest("guest-2", 2, { send() {} });
    let restored: typeof state | null = null;
    host.bindState(() => state, (next) => { restored = next; });
    host.disconnectGuest("guest-2");

    expect(host.forfeitGuest("guest-2")).toBe(2);
    expect(host.status).toBe("connected");
    expect(state.multiplayerOwners).toEqual([0, 1]);
    expect(state.entities.filter((entity) => entity.owner === 2 && entity.hp > 0)).toHaveLength(0);
    expect(restored).toMatchObject({ multiplayerOwners: [0, 1] });
  });

  it("broadcasts host departure to all connected guests and cannot revive an ended room", () => {
    const messages: unknown[][] = [[], [], []];
    const host = new MultiplayerSession("host", 0, 42, { send() {} }, [0, 1, 2, 3]);
    [1, 2, 3].forEach((owner) => host.addGuest(`g${owner}`, owner as Owner, { send: (value) => messages[owner - 1]!.push(value) }));
    host.disconnectGuest("g2");
    host.end();
    expect(messages.map((items) => items.at(-1))).toEqual([{ type: "ended" }, undefined, { type: "ended" }]);
    expect(host.reconnectGuest("g2", { send() {} })).toBe(false);
  });

  it("rejects malformed owner-spoofed intents and accepts only protocol v3 settings", () => {
    expect(sanitizeCommand({ type: "move", unitIds: [1], x: 4, y: 4, owner: 3 })).toBeNull();
    expect(sanitizeCommand({ type: "attack", unitIds: [1], targetId: -2 })).toBeNull();
    expect(sanitizeCommand({ type: "build", building: "constructionYard", x: 4, y: 4 })).toBeNull();
    expect(sanitizeCommand({ type: "move", unitIds: [1], x: 4, y: 4 }, true)).toBeNull();
    expect(sanitizeCommand({ type: "move", unitIds: [1], x: 4, y: 4 })).toEqual({ type: "move", unitIds: [1], x: 4, y: 4 });
    expect(validSkirmishMatchSettings(SKIRMISH_MATCH_SETTINGS)).toBe(true);
    expect(validSkirmishMatchSettings({ ...SKIRMISH_MATCH_SETTINGS, protocolVersion: 1 })).toBe(false);
    expect(validSkirmishMatchSettings({ ...SKIRMISH_MATCH_SETTINGS, mode: "teams" })).toBe(false);
  });

  it("shares validated AI seat assignments with every peer and rejects AI hosts or inactive seats", () => {
    const owners: Owner[] = [0, 1, 2];
    const aiOwners: Owner[] = [1];
    const host = new MultiplayerSession("host", 0, 91, { send() {} }, owners, aiOwners);
    const guest = new MultiplayerSession("guest", 2, 91, { send() {} }, owners, aiOwners);
    expect(host.aiOwners).toEqual(aiOwners);
    expect(guest.aiOwners).toEqual(aiOwners);
    expect(() => new MultiplayerSession("host", 0, 91, { send() {} }, owners, [3])).toThrow("Invalid multiplayer roster");
    expect(() => new MultiplayerSession("host", 0, 91, { send() {} }, owners, [0])).toThrow("Invalid multiplayer roster");
    expect(() => new MultiplayerSession("guest", 1, 91, { send() {} }, owners, [1])).toThrow("Invalid multiplayer roster");
    expect(host.addGuest("ai-seat", 1, { send() {} })).toBe(false);
    expect(host.addGuest("human-seat", 2, { send() {} })).toBe(true);
  });

  it("restores snapshots in the reconnecting guest's fog and result perspective", () => {
    const hostState = createSkirmish(8123, 0, [0, 1, 2, 3]).state;
    const guestState = createSkirmish(8123, 3, [0, 1, 2, 3]).state;
    hostState.result = "won";
    hostState.winner = 0;
    let restored: typeof guestState | null = null;
    const guest = new MultiplayerSession("guest", 3, 8123, { send() {} }, [0, 1, 2, 3]);
    guest.bindState(() => guestState, (state) => { restored = state; });
    guest.receive({ type: "resync", state: hostState });
    guest.canAdvance(guestState);

    const hostYard = hostState.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard")!;
    const guestYard = hostState.entities.find((entity) => entity.owner === 3 && entity.kind === "constructionYard")!;
    expect(restored).toMatchObject({ viewOwner: 3, result: "lost", winner: 0 });
    expect(fogAt(restored!, guestYard.x, guestYard.y)).toBe(2);
    expect(fogAt(restored!, hostYard.x, hostYard.y)).toBeLessThan(2);
  });

  it("counts queued frames for guest catch-up and returns 0 for host", () => {
    const owners: Owner[] = [0, 1];
    const host = new MultiplayerSession("host", 0, 8123, { send() {} }, owners);
    const guest = new MultiplayerSession("guest", 1, 8123, { send() {} }, owners);

    expect(host.queuedFramesCount({ tick: 0 } as never)).toBe(0);
    expect(guest.queuedFramesCount({ tick: 0 } as never)).toBe(0);

    // Host sends frames 1, 2, 3
    guest.receive({ type: "tick", protocolVersion: 3, tick: 1, commands: [] });
    guest.receive({ type: "tick", protocolVersion: 3, tick: 2, commands: [] });
    guest.receive({ type: "tick", protocolVersion: 3, tick: 3, commands: [] });

    expect(guest.queuedFramesCount({ tick: 0 } as never)).toBe(3);
    expect(guest.queuedFramesCount({ tick: 1 } as never)).toBe(2);
    expect(guest.queuedFramesCount({ tick: 3 } as never)).toBe(0);
  });

  it("prunes obsolete buffered frames and marks forfeited guests as lost on resync", () => {
    const owners: Owner[] = [0, 1, 2];
    const guestState = createSkirmish(8123, 2, owners).state;
    const guest = new MultiplayerSession("guest", 2, 8123, { send() {} }, owners);
    let synced: typeof guestState | null = null;
    guest.bindState(() => guestState, (s) => { synced = s; });

    // Buffer old frames 1 and 2, and future frame 5
    guest.receive({ type: "tick", protocolVersion: 3, tick: 1, commands: [] });
    guest.receive({ type: "tick", protocolVersion: 3, tick: 2, commands: [] });
    guest.receive({ type: "tick", protocolVersion: 3, tick: 5, commands: [] });

    // Host sends resync at tick 4 where guest 2 has been forfeited (multiplayerOwners = [0, 1])
    const resyncState = createSkirmish(8123, 0, [0, 1]).state;
    resyncState.tick = 4;
    guest.receive({ type: "resync", state: resyncState });
    guest.canAdvance(guestState);

    expect(synced).toBeDefined();
    expect(synced!.result).toBe("lost");
    // Past frames 1 and 2 should have been purged, leaving only frame 5
    expect(guest.queuedFramesCount({ tick: 4 } as never)).toBe(1);
  });
});

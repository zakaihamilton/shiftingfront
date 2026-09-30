import { describe, expect, it, vi } from "vitest";
import { createSkirmish, tick } from "@/lib/sim/api";
import { stateChecksum } from "@/lib/multiplayer/checksum";
import { MultiplayerSession, SKIRMISH_MATCH_SETTINGS, validSkirmishMatchSettings } from "@/lib/multiplayer/session";

function connectedPair() {
  let hostState = createSkirmish(42, 0, [0, 1]).state;
  let guestState = createSkirmish(42, 1, [0, 1]).state;
  const messages: unknown[] = [];
  const host = new MultiplayerSession("host", 0, 42, { send() {} });
  const guest = new MultiplayerSession("guest", 1, 42, { send: (message) => host.receiveFrom("g", message) });
  host.addGuest("g", 1, { send: (message) => { messages.push(message); guest.receive(message); } });
  host.bindState(() => hostState, (state) => { hostState = state; });
  guest.bindState(() => guestState, (state) => { guestState = state; });
  return { host, guest, messages, hostState: () => hostState, guestState: () => guestState };
}

describe("multiplayer checks", () => {
  it("rejects a different simulation build even with the same protocol", () => {
    expect(validSkirmishMatchSettings({ ...SKIRMISH_MATCH_SETTINGS, simulationBuildId: "other" })).toBe(false);
  });
  it("has matching checks across viewpoints, entity order, and terminal results", () => {
    const first = createSkirmish(42, 0, [0, 1]).state;
    const second = createSkirmish(42, 1, [0, 1]).state;
    second.entities.reverse(); second.controlGroups = { "1": [2] };
    expect(stateChecksum(first)).toBe(stateChecksum(second));
    first.winner = second.winner = 0; first.result = "won"; second.result = "lost";
    expect(stateChecksum(first)).toBe(stateChecksum(second));
    second.credits[1]++;
    expect(stateChecksum(first)).not.toBe(stateChecksum(second));
  });
  it("repairs divergence once and ends on a verified recurrence", () => {
    const pair = connectedPair();
    pair.guestState().credits[1] = 100;
    for (let i = 0; i < 120; i++) { tick(pair.hostState()); tick(pair.guestState()); }
    pair.host.checkState(pair.hostState()); pair.guest.checkState(pair.guestState());
    expect(pair.host.synchronizationNotice).toContain("Synchronizing");
    expect(pair.guest.syncSnapshot()).toBe(true);
    expect(stateChecksum(pair.guestState())).toBe(stateChecksum(pair.hostState()));
    expect(pair.host.synchronizationNotice).toBe("Synchronization restored.");
    pair.guestState().credits[1]--;
    for (let i = 0; i < 120; i++) { tick(pair.hostState()); tick(pair.guestState()); }
    pair.host.checkState(pair.hostState()); pair.guest.checkState(pair.guestState());
    expect(pair.host.status).toBe("ended"); expect(pair.guest.status).toBe("ended");
    expect(pair.guest.synchronizationNotice).toContain("Synchronization failed");
  });
  it("ignores unauthenticated and malformed reports", () => {
    const pair = connectedPair();
    pair.host.receiveFrom("unknown", { type: "desync", protocolVersion: 5, tick: 0, checksum: "0000000000000000" });
    pair.host.receiveFrom("g", { type: "desync", protocolVersion: 5, tick: -1, checksum: "bad" });
    expect(pair.host.status).toBe("connected");
    expect(pair.host.synchronizationNotice).toBeNull();
  });
  it("ends all peers when a snapshot fails verification even if its actual digest matches the host", () => {
    const pair = connectedPair();
    pair.host.receiveFrom("g", { type: "desync", protocolVersion: 5, tick: 0, checksum: "0000000000000000" });
    const snapshot = pair.messages.find((message) => (message as { type: string }).type === "resync") as Record<string, unknown>;
    pair.guest.receive({ ...snapshot, checksum: "0000000000000000" });
    expect(pair.guest.syncSnapshot()).toBe(false);
    expect(pair.host.status).toBe("ended"); expect(pair.guest.status).toBe("ended");
  });
  it("ends a repair that is never acknowledged within sixty seconds", () => {
    const pair = connectedPair();
    vi.spyOn(performance, "now").mockReturnValue(0);
    pair.host.receiveFrom("g", { type: "desync", protocolVersion: 5, tick: 0, checksum: "0000000000000000" });
    vi.spyOn(performance, "now").mockReturnValue(60_001);
    pair.host.syncSnapshot();
    expect(pair.host.status).toBe("ended");
    vi.restoreAllMocks();
  });
});

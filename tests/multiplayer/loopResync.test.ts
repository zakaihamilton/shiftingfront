import { afterEach, describe, expect, it, vi } from "vitest";
import { startLoop, TICK_MS } from "@/lib/game/loop";
import { createSkirmish, tick } from "@/lib/sim/api";
import { MultiplayerSession, SKIRMISH_MATCH_SETTINGS } from "@/lib/multiplayer/session";
import { stateChecksum } from "@/lib/multiplayer/checksum";

afterEach(() => vi.unstubAllGlobals());
describe("frame-boundary multiplayer resync", () => {
  it.each([false, true])("keeps a same-tick replacement authoritative (paused=%s)", (paused) => {
    let frame: FrameRequestCallback;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    let current = createSkirmish(8123, 1, [0, 1]).state;
    current.controlGroups = { "1": [1] };
    const snapshot = createSkirmish(8123, 0, [0, 1]).state;
    snapshot.credits[1] = 1234;
    const guest = new MultiplayerSession("guest", 1, 8123, { send() {} });
    guest.bindState(() => current, (state) => { current = state; });
    guest.receive({ type: "tick", protocolVersion: SKIRMISH_MATCH_SETTINGS.protocolVersion, tick: 1, commands: [] });
    guest.receive({ type: "resync", protocolVersion: SKIRMISH_MATCH_SETTINGS.protocolVersion, state: snapshot, checksum: stateChecksum(snapshot) });
    const started = performance.now();
    let drawn = current;
    const loop = startLoop({ beforeFrame: () => guest.syncSnapshot(), getState: () => current,
      setState: (state) => { current = state; }, isPaused: () => paused,
      getExtraTicks: (state) => guest.queuedFramesCount(state), canStep: (state) => guest.canAdvance(state),
      drainCommands: () => guest.drainTick(current, []), step: tick, onFrame: (_, state) => { drawn = state; } });
    frame!(started + TICK_MS + 1);
    expect(current.credits[1]).toBe(1234);
    expect(drawn).toBe(current);
    expect(current.controlGroups).toEqual({ "1": [1] });
    expect(current.tick).toBe(paused ? 0 : 1);
    loop.stop();
  });
});

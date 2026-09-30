// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createPersistenceCoordinator } from "@/components/game/hooks/runtime/persistence";
import { createMissionUxTelemetry } from "@/lib/persist/telemetry";
import { makeFixture } from "@/lib/sim/fixtures";
import type { SaveWriteStatus } from "@/lib/persist/save";

function runtime() {
  const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
  const stateRef = { current: state }; const terminalSaveRef = { current: false }; const alert = vi.fn();
  const completed: Array<(status: SaveWriteStatus) => void> = [];
  const write = vi.fn(() => new Promise<SaveWriteStatus>((resolve) => completed.push(resolve)));
  const coordinator = createPersistenceCoordinator({ stateRef, terminalSaveRef, campaignRecordedRef: { current: false },
    saveSession: { write, adoptCurrent() {}, markExternalChange() {} }, persistCampaign: true, onAlert: alert,
    persistenceRef: { current: { saveRetry: { state: null, retry: false, nextAttemptMs: 0, lastStatus: "saved" }, nextCampaignSaveAttemptMs: 0 } } });
  return { state, stateRef, terminalSaveRef, alert, write, completed, coordinator };
}
describe("asynchronous runtime persistence", () => {
  it("coalesces pending requests and does not treat an earlier playing snapshot as terminal", async () => {
    const current = runtime(); current.coordinator.scheduleAutosave();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const persistence = current.coordinator;
    current.state.result = "lost";
    persistence.onTerminal(current.state, 1, { commandsIssued: 0, commandRejections: 0, ux: createMissionUxTelemetry(), assaultTransitions: 0 });
    persistence.onTerminal(current.state, 2, { commandsIssued: 0, commandRejections: 0, ux: createMissionUxTelemetry(), assaultTransitions: 0 });
    expect(current.write).toHaveBeenCalledOnce(); current.completed[0]("saved"); await Promise.resolve();
    expect(current.terminalSaveRef.current).toBe(false);
    expect(current.write).toHaveBeenCalledTimes(2); current.completed[1]("saved"); await Promise.resolve();
    expect(current.terminalSaveRef.current).toBe(true); persistence.stop();
  });
  it("ignores delayed failures belonging to a replaced mission", async () => {
    const current = runtime(); current.state.result = "lost";
    current.coordinator.onTerminal(current.state, 1, { commandsIssued: 0, commandRejections: 0, ux: createMissionUxTelemetry(), assaultTransitions: 0 });
    current.stateRef.current = makeFixture({ seed: 421, win: { kind: "annihilate" } }); current.coordinator.reset();
    current.completed[0]("failed"); await Promise.resolve();
    expect(current.alert).not.toHaveBeenCalled(); expect(current.terminalSaveRef.current).toBe(false);
  });
});

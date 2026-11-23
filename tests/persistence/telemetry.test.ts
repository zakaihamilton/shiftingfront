import { describe, expect, it } from "vitest";
import { memoryStorage } from "../../lib/persist/save";
import {
  clearTelemetry,
  normalizeTelemetry,
  readTelemetry,
  recordTelemetry,
  serializeTelemetry,
  summarizeTelemetry,
  TELEMETRY_KEY,
  TELEMETRY_MAX_RECORDS,
} from "../../lib/persist/telemetry";

const record = (index: number) => ({
  missionIndex: index,
  missionKind: "rescue" as const,
  result: "won" as const,
  durationTicks: 100,
  deadlineOutcome: "completed" as const,
  credits: 800,
  unitsProduced: 4,
  casualties: 2,
  commandsIssued: 10,
  commandRejections: 1,
  secondaryObjectivesCompleted: 1,
  secondaryObjectivesTotal: 2,
  assaultTransitions: 2,
  firstPressureTick: 48,
  firstHqThreatTick: 72,
  hqHealthAtEnd: 0,
  recordedAt: index,
});

describe("local telemetry", () => {
  it("normalizes malformed records and retains only the bounded tail", () => {
    const records = normalizeTelemetry([
      record(1),
      { missionIndex: "bad", result: "won" },
      ...Array.from({ length: TELEMETRY_MAX_RECORDS + 4 }, (_, index) => record(index + 2)),
    ]);
    expect(records).toHaveLength(TELEMETRY_MAX_RECORDS);
    expect(records[0]?.missionIndex).toBe(6);
  });

  it("round-trips records and summarizes only aggregate fields", () => {
    const storage = memoryStorage();
    recordTelemetry(storage, record(0));
    recordTelemetry(storage, {
      ...record(1),
      result: "lost",
      deadlineOutcome: "timedOut",
      casualties: 6,
    });
    expect(readTelemetry(storage)).toHaveLength(2);
    expect(readTelemetry(storage)[1]?.hqHealthAtEnd).toBe(0);
    expect(JSON.parse(storage.getItem(TELEMETRY_KEY)!)).not.toHaveProperty("coordinates");
    expect(summarizeTelemetry(readTelemetry(storage))).toMatchObject({
      missions: 2,
      wins: 1,
      losses: 1,
      timeouts: 1,
      averageCasualties: 4,
      averageTimeToPressureTicks: 48,
      averageTimeToHqThreatTicks: 72,
    });
  });

  it("normalizes UX telemetry while preserving compatibility with older records", () => {
    const storage = memoryStorage();
    recordTelemetry(storage, {
      ...record(0),
      ux: {
        briefingSkipped: true,
        controlsOpened: 2,
        tutorialCompleted: false,
        tutorialExited: true,
        mobilePanelOpened: 3,
        objectivePanelToggles: 4,
        firstSelectionTick: 12,
        firstOrderTick: 20,
        firstBuildTick: 30,
        firstProductionTick: 40,
        commandFeedbackCount: 7,
        commandRejectionsByReason: { invalidDestination: 2 },
      },
    });
    expect(readTelemetry(storage)[0]?.ux).toMatchObject({
      briefingSkipped: true,
      mobilePanelOpened: 3,
      firstProductionTick: 40,
      commandRejectionsByReason: { invalidDestination: 2 },
    });
    expect(
      readTelemetry(
        memoryStorage({
          [TELEMETRY_KEY]: JSON.stringify({ version: 1, records: [record(1)] }),
        }),
      )[0]?.ux,
    ).toMatchObject({ commandFeedbackCount: 0 });
  });

  it("exports a versioned normalized envelope and clears only telemetry", () => {
    const storage = memoryStorage({ "shiftingfront:save:421": "keep this save" });
    recordTelemetry(storage, record(0));
    storage.setItem(
      TELEMETRY_KEY,
      JSON.stringify({
        version: 1,
        records: [record(0), { missionIndex: "invalid" }],
      }),
    );

    const exported = JSON.parse(serializeTelemetry(storage));
    expect(exported).toMatchObject({ version: 1, records: [record(0)] });
    expect(exported.records[0]).not.toHaveProperty("coordinates");

    expect(clearTelemetry(storage)).toBe(true);
    expect(storage.getItem(TELEMETRY_KEY)).toBeNull();
    expect(storage.getItem("shiftingfront:save:421")).toBe("keep this save");
  });

  it("exports an empty envelope when telemetry storage is malformed", () => {
    const storage = memoryStorage({ [TELEMETRY_KEY]: "not-json" });

    expect(JSON.parse(serializeTelemetry(storage))).toEqual({ version: 1, records: [] });
  });
});

import { recordWonCampaignProgress } from "@/lib/persist/campaign";
import { cachedLocalStorage, saveKey, type SaveSession, type SaveWriteStatus } from "@/lib/persist/save";
import { recordTelemetry, telemetryFromMission } from "@/lib/persist/telemetry";
import type { SimState } from "@/lib/types";
import type { RuntimeCounters, RuntimePersistenceState } from "./types";

const CAMPAIGN_SAVE_RETRY_MS = 1_000;

type SaveRetry = {
  state: SimState | null;
  retry: boolean;
  nextAttemptMs: number;
  lastStatus: SaveWriteStatus;
};

export function createPersistenceCoordinator({
  stateRef,
  terminalSaveRef,
  campaignRecordedRef,
  saveSession,
  persistCampaign,
  onAlert,
  onTacticalAnnouncement,
  persistenceRef,
  suppressImplicitSavesRef,
}: {
  stateRef: { current: SimState };
  terminalSaveRef: { current: boolean };
  campaignRecordedRef: { current: boolean };
  saveSession: SaveSession;
  persistCampaign: boolean;
  onAlert: (text: string) => void;
  onTacticalAnnouncement: (text: string) => void;
  persistenceRef: { current: RuntimePersistenceState };
  suppressImplicitSavesRef?: { current: () => void };
}) {
  const saveRetry: SaveRetry = persistenceRef.current.saveRetry;
  let idleHandle: number | null = null;
  let idleViaTimeout = false;
  let nextCampaignSaveAttemptMs = persistenceRef.current.nextCampaignSaveAttemptMs;
  let implicitSavesSuppressed = false;

  const cancelIdle = () => {
    if (idleHandle === null) return;
    if (idleViaTimeout) clearTimeout(idleHandle);
    else if (typeof cancelIdleCallback === "function") cancelIdleCallback(idleHandle);
    idleHandle = null;
  };

  const saveImplicit = (state: SimState, now: number) => {
    if (implicitSavesSuppressed) return "saved" as const;
    const status = saveSession.write(state, "implicit");
    saveRetry.state = state;
    saveRetry.retry = status === "failed";
    saveRetry.nextAttemptMs = now + CAMPAIGN_SAVE_RETRY_MS;
    if (status !== saveRetry.lastStatus) {
      const message = status === "conflict"
        ? "Autosave paused: this campaign changed in another tab. Use Save Mission or Load Mission to resolve it."
        : status === "failed"
          ? "Progress could not be saved. Retrying; check available browser storage."
          : "Progress saved.";
      onAlert(message);
      onTacticalAnnouncement(message);
    }
    saveRetry.lastStatus = status;
    if (status === "saved" && state.result !== "playing") terminalSaveRef.current = true;
    return status;
  };

  const reset = () => {
    cancelIdle();
    implicitSavesSuppressed = false;
    saveRetry.state = null;
    saveRetry.retry = false;
    saveRetry.nextAttemptMs = 0;
    saveRetry.lastStatus = "saved";
    nextCampaignSaveAttemptMs = 0;
    persistenceRef.current.nextCampaignSaveAttemptMs = 0;
  };

  const scheduleAutosave = () => {
    if (!persistCampaign || implicitSavesSuppressed) return;
    cancelIdle();
    const run = () => {
      idleHandle = null;
      saveImplicit(stateRef.current, performance.now());
    };
    if (typeof requestIdleCallback === "function") {
      idleViaTimeout = false;
      idleHandle = requestIdleCallback(run, { timeout: 250 });
    } else {
      idleViaTimeout = true;
      idleHandle = window.setTimeout(run, 0);
    }
  };

  const saveOnPageHide = () => {
    if (!persistCampaign) return;
    const state = stateRef.current;
    saveImplicit(state, performance.now());
    if (state.result === "won" && !campaignRecordedRef.current && recordWonCampaignProgress(cachedLocalStorage(), state)) {
      campaignRecordedRef.current = true;
    }
  };

  const suppressImplicitSaves = () => {
    implicitSavesSuppressed = true;
    cancelIdle();
  };

  if (suppressImplicitSavesRef) suppressImplicitSavesRef.current = suppressImplicitSaves;

  const onStorage = (event: StorageEvent) => {
    if (saveSession.isStorageEventForSession && !saveSession.isStorageEventForSession(event.storageArea)) return;
    if (event.key === saveKey(stateRef.current.seed)) saveSession.markExternalChange();
  };

  return {
    reset,
    suppressImplicitSaves,
    scheduleAutosave,
    onTickFrame(state: SimState, now: number) {
      if (!persistCampaign || implicitSavesSuppressed) return;
      if (saveRetry.retry && now >= saveRetry.nextAttemptMs) saveImplicit(state, now);
      if (state.result === "won" && !campaignRecordedRef.current && now >= nextCampaignSaveAttemptMs) {
        const recorded = recordWonCampaignProgress(cachedLocalStorage(), state);
        if (recorded) campaignRecordedRef.current = true;
        else {
          nextCampaignSaveAttemptMs = now + CAMPAIGN_SAVE_RETRY_MS;
          persistenceRef.current.nextCampaignSaveAttemptMs = nextCampaignSaveAttemptMs;
        }
      }
    },
    onTerminal(state: SimState, now: number, counters: RuntimeCounters) {
      if (!persistCampaign || implicitSavesSuppressed) return;
      cancelIdle();
      saveImplicit(state, now);
      recordTelemetry(
        cachedLocalStorage(),
        telemetryFromMission(state, counters),
      );
    },
    start() {
      window.addEventListener("pagehide", saveOnPageHide);
      window.addEventListener("beforeunload", saveOnPageHide);
      window.addEventListener("storage", onStorage);
    },
    stop() {
      cancelIdle();
      window.removeEventListener("pagehide", saveOnPageHide);
      window.removeEventListener("beforeunload", saveOnPageHide);
      window.removeEventListener("storage", onStorage);
    },
  };
}

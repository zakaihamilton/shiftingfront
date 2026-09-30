import { recordWonCampaignProgress } from "@/lib/persist/campaign";
import { cachedLocalStorage, getSaveRepository, saveKey, type SaveSession, type SaveWriteStatus } from "@/lib/persist/save";
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
  persistenceRef,
  suppressImplicitSavesRef,
}: {
  stateRef: { current: SimState };
  terminalSaveRef: { current: boolean };
  campaignRecordedRef: { current: boolean };
  saveSession: SaveSession;
  persistCampaign: boolean;
  onAlert: (text: string) => void;
  persistenceRef: { current: RuntimePersistenceState };
  suppressImplicitSavesRef?: { current: () => void };
}) {
  const saveRetry: SaveRetry = persistenceRef.current.saveRetry;
  let idleHandle: number | null = null;
  let idleViaTimeout = false;
  let nextCampaignSaveAttemptMs = persistenceRef.current.nextCampaignSaveAttemptMs;
  let implicitSavesSuppressed = false;
  let saving = false;
  let pendingSave = false;
  let generation = 0;

  const cancelIdle = () => {
    if (idleHandle === null) return;
    if (idleViaTimeout) clearTimeout(idleHandle);
    else if (typeof cancelIdleCallback === "function") cancelIdleCallback(idleHandle);
    idleHandle = null;
  };

  const saveImplicit = (state: SimState, now: number): void => {
    if (implicitSavesSuppressed) return;
    if (saving) { pendingSave = true; return; }
    const token = generation;
    const savedResult = state.result;
    const completed = (status: SaveWriteStatus, asynchronous = false) => {
      if (token !== generation) return;
      saving = false;
      if (asynchronous && stateRef.current !== state) {
        if (pendingSave) {
          pendingSave = false;
          saveImplicit(stateRef.current, performance.now());
        }
        return;
      }
      saveRetry.state = state;
      saveRetry.retry = status === "failed";
      saveRetry.nextAttemptMs = now + CAMPAIGN_SAVE_RETRY_MS;
      if (status !== saveRetry.lastStatus) {
        onAlert(status === "conflict"
          ? "Autosave paused: this campaign changed in another tab. Use Save Mission or Load Mission to resolve it."
          : status === "failed" ? "Progress could not be saved. Retrying; check available browser storage." : "Progress saved.");
      }
      saveRetry.lastStatus = status;
      if (status === "saved" && savedResult !== "playing") {
        terminalSaveRef.current = true;
        if (getSaveRepository()?.mode === "indexeddb" && savedResult === "won") campaignRecordedRef.current = true;
      }
      if (pendingSave) { pendingSave = false; saveImplicit(stateRef.current, performance.now()); }
    };
    const status = saveSession.write(state, "implicit");
    if (status instanceof Promise) { saving = true; void status.then((status) => completed(status, true), () => completed("failed", true)); }
    else completed(status);
  };

  const reset = () => {
    generation++; saving = false; pendingSave = false;
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
    saveSession.writeJournal?.(state);
    saveImplicit(state, performance.now());
    if (getSaveRepository()?.mode !== "indexeddb" && state.result === "won" && !campaignRecordedRef.current && recordWonCampaignProgress(cachedLocalStorage(), state)) {
      campaignRecordedRef.current = true;
    }
  };

  const suppressImplicitSaves = () => {
    generation++;
    implicitSavesSuppressed = true;
    cancelIdle();
  };

  if (suppressImplicitSavesRef) suppressImplicitSavesRef.current = suppressImplicitSaves;

  const onStorage = (event: StorageEvent) => {
    if (saveSession.isStorageEventForSession && !saveSession.isStorageEventForSession(event.storageArea)) return;
    if (event.key === saveKey(stateRef.current.seed)) saveSession.markExternalChange();
  };
  const onVisibility = () => { if (document.visibilityState === "hidden") saveOnPageHide(); };

  return {
    reset,
    suppressImplicitSaves,
    scheduleAutosave,
    onTickFrame(state: SimState, now: number) {
      if (!persistCampaign || implicitSavesSuppressed) return;
      if (saveRetry.retry && now >= saveRetry.nextAttemptMs) saveImplicit(state, now);
      if (getSaveRepository()?.mode !== "indexeddb" && state.result === "won" && !campaignRecordedRef.current && now >= nextCampaignSaveAttemptMs) {
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
      document.addEventListener("visibilitychange", onVisibility);
    },
    stop() {
      cancelIdle();
      window.removeEventListener("pagehide", saveOnPageHide);
      window.removeEventListener("beforeunload", saveOnPageHide);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

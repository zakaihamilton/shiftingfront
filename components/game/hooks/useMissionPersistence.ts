import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { beep } from "@/lib/audio/synth";
import { clearMusicPosition, TUTORIAL_MUSIC_MISSION } from "@/lib/audio/music";
import {
  cachedLocalStorage,
  defaultSlotName,
  hasLoadableSaves,
  listPauseLoadEntries,
  listSlots,
  readSave,
  readSlot,
  removeSave,
  removeSlot,
  writeSlot,
  type ArchiveEntry,
} from "@/lib/persist/save";
import { restoreSlot } from "@/lib/persist/save/restore";
import type { SaveSession } from "@/lib/persist/save";
import { readCampaignProgress } from "@/lib/persist/campaign";
import { createMission } from "@/lib/sim/api";
import { createTutorialMission } from "@/lib/sim/tutorial";
import { formatSeed } from "@/lib/seed/rng";
import type { Command, SimState } from "@/lib/types";
import type { PauseView } from "@/lib/ui/shortcuts";
import type { FxBurst } from "@/lib/render/fx";
import type { RuntimeCommandPort } from "./runtime/facade";

export type MissionPersistenceParams = {
  seed: number;
  stateRef: MutableRefObject<SimState>;
  setState: Dispatch<SetStateAction<SimState>>;
  commitSelection: (ids: number[]) => void;
  commandPort?: RuntimeCommandPort;
  /** Compatibility input for isolated hook consumers. */
  cmdQRef: MutableRefObject<Command[]>;
  fxRef: MutableRefObject<FxBurst[]>;
  clearTools: () => void;
  resetInput: () => void;
  resetCamera: (state: SimState) => void;
  pausedRef: MutableRefObject<boolean>;
  setPaused: Dispatch<SetStateAction<boolean>>;
  setPauseView: Dispatch<SetStateAction<PauseView>>;
  setPauseNotice: Dispatch<SetStateAction<string>>;
  campaignRecordedRef: MutableRefObject<boolean>;
  terminalSaveRef: MutableRefObject<boolean>;
  saveSession: SaveSession;
  tutorial?: boolean;
  suppressImplicitSavesRef?: MutableRefObject<() => void>;
};

export function useMissionPersistence({
  seed,
  stateRef,
  setState,
  commitSelection,
  commandPort,
  cmdQRef,
  fxRef,
  clearTools,
  resetInput,
  resetCamera,
  pausedRef,
  setPaused,
  setPauseView,
  setPauseNotice,
  campaignRecordedRef,
  terminalSaveRef,
  saveSession,
  tutorial = false,
  suppressImplicitSavesRef,
}: MissionPersistenceParams) {
  const router = useRouter();

  const applyLoadedState = useCallback((loaded: SimState, notice: string) => {
    stateRef.current = loaded;
    saveSession.adoptCurrent();
    campaignRecordedRef.current = loaded.result === "won";
    terminalSaveRef.current = loaded.result !== "playing";
    setState({ ...loaded, entities: [...loaded.entities] });
    commitSelection([]);
    if (commandPort) commandPort.clear();
    else cmdQRef.current = [];
    fxRef.current = [];
    clearTools();
    resetInput();
    resetCamera(loaded);
    setPauseView("main");
    setPauseNotice(notice);
  }, [
    campaignRecordedRef,
    clearTools,
    cmdQRef,
    commandPort,
    commitSelection,
    fxRef,
    resetCamera,
    resetInput,
    saveSession,
    setPauseNotice,
    setPauseView,
    setState,
    stateRef,
    terminalSaveRef,
  ]);

  const openSaveSlots = useCallback(() => {
    if (tutorial) {
      setPauseNotice("Training isn't saved to a campaign.");
      return;
    }
    setPauseNotice("");
    setPauseView("save");
  }, [setPauseNotice, setPauseView, tutorial]);

  const openLoadSlots = useCallback(() => {
    if (tutorial) {
      setPauseNotice("Training isn't saved to a campaign.");
      return;
    }
    if (!hasLoadableSaves(cachedLocalStorage(), seed)) {
      setPauseNotice("No save slots.");
      return;
    }
    setPauseNotice("");
    setPauseView("load");
  }, [seed, setPauseNotice, setPauseView, tutorial]);

  const saveNamedSlot = useCallback((name: string, overwriteId: string | null) => {
    if (tutorial) {
      setPauseNotice("Training isn't saved to a campaign.");
      return false;
    }
    const current = stateRef.current;
    const storage = cachedLocalStorage();
    const written = writeSlot(storage, {
      id: overwriteId ?? undefined,
      name,
      state: current,
      campaign: readCampaignProgress(storage, current.seed),
    });
    if (!written.ok) {
      setPauseNotice("Couldn't save. Check that this browser allows site data.");
      return false;
    }
    const status = saveSession.write(current, "explicit");
    const slot = readSlot(storage, written.id);
    const savedName = slot?.name ?? name;
    setPauseView("main");
    setPauseNotice(status === "saved"
      ? `Saved “${savedName}”.`
      : `Saved “${savedName}”, but the autosave could not be updated. Use Load Mission to restore this named slot.`);
    return true;
  }, [saveSession, setPauseNotice, setPauseView, stateRef, tutorial]);

  const loadArchiveEntry = useCallback((entry: ArchiveEntry) => {
    if (tutorial) {
      setPauseNotice("Training isn't saved to a campaign.");
      return;
    }
    const storage = cachedLocalStorage();
    if (entry.kind === "autosave") {
      const loaded = readSave(storage, Number(entry.seed));
      if (!loaded) {
        setPauseNotice("No save found for this campaign.");
        return;
      }
      if (loaded.seed === seed && loaded.missionIndex === stateRef.current.missionIndex) {
        applyLoadedState(loaded, "Loaded the autosave.");
        return;
      }
      suppressImplicitSavesRef?.current();
      router.push(`/play?seed=${formatSeed(loaded.seed)}&mission=${loaded.missionIndex}&resume=1`);
      return;
    }

    const slot = readSlot(storage, entry.id);
    if (!slot) {
      setPauseNotice("Couldn't load that save slot.");
      return;
    }
    const error = restoreSlot(storage, slot);
    if (error) {
      setPauseNotice(error);
      return;
    }
    if (slot.state.seed === seed && slot.state.missionIndex === stateRef.current.missionIndex) {
      applyLoadedState(slot.state, `Loaded “${slot.name}”.`);
      return;
    }
    suppressImplicitSavesRef?.current();
    router.push(`/play?seed=${formatSeed(slot.state.seed)}&mission=${slot.state.missionIndex}&resume=1`);
  }, [applyLoadedState, router, seed, setPauseNotice, stateRef, suppressImplicitSavesRef, tutorial]);

  const restartMissionNow = useCallback(() => {
    const world = stateRef.current;
    const missionIdx = tutorial ? TUTORIAL_MUSIC_MISSION : world.missionIndex;
    clearMusicPosition("mission", world.seed, missionIdx);
    const fresh = tutorial ? createTutorialMission() : createMission({ seed: world.seed, missionIndex: world.missionIndex });
    stateRef.current = fresh;
    terminalSaveRef.current = false;
    campaignRecordedRef.current = false;
    setState({ ...fresh, entities: [...fresh.entities] });
    commitSelection([]);
    if (commandPort) commandPort.clear();
    else cmdQRef.current = [];
    fxRef.current = [];
    clearTools();
    resetInput();
    pausedRef.current = false;
    setPaused(false);
    setPauseView("main");
    setPauseNotice("");
    resetCamera(fresh);
    beep("select");
  }, [
    campaignRecordedRef,
    clearTools,
    cmdQRef,
    commandPort,
    commitSelection,
    fxRef,
    pausedRef,
    resetCamera,
    resetInput,
    setPauseNotice,
    setPauseView,
    setPaused,
    setState,
    stateRef,
    terminalSaveRef,
    tutorial,
  ]);

  const deleteArchiveEntry = useCallback((entry: ArchiveEntry) => {
    const storage = cachedLocalStorage();
    if (entry.kind === "slot") {
      removeSlot(storage, entry.id);
    } else {
      removeSave(storage, Number(entry.seed));
    }
  }, []);

  return {
    openSaveSlots,
    openLoadSlots,
    saveNamedSlot,
    loadArchiveEntry,
    deleteArchiveEntry,
    defaultSlotName: () => defaultSlotName(stateRef.current),
    listSaveSlots: () => listSlots(cachedLocalStorage()),
    listLoadEntries: () => listPauseLoadEntries(cachedLocalStorage(), seed),
    restartMissionNow,
  };
}

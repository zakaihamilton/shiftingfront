import { useCallback, type MutableRefObject } from "react";
import { useRouter } from "next/navigation";
import { cachedLocalStorage, type SaveSession } from "@/lib/persist/save";
import { recordWonCampaignProgress } from "@/lib/persist/campaign";
import type { SimState } from "@/lib/types";
import { MISSION_MAX } from "@/lib/seed/rng";
import {
  briefingPath,
  campaignCompletePath,
  campaignPath,
  menuPath,
  resultPrimaryPath,
  tutorialPath,
} from "@/lib/navigation/routes";

export function useMissionRoutes({
  stateRef,
  saveSession,
  onSaveError,
  tutorial = false,
}: {
  stateRef: MutableRefObject<SimState>;
  saveSession: SaveSession;
  onSaveError: (message: string, leaveWithoutSave: () => void) => void;
  tutorial?: boolean;
}) {
  const router = useRouter();

  const prepareLeave = useCallback((leaveWithoutSave: () => void = () => undefined) => {
    if (tutorial) return true;
    const state = stateRef.current;
    if (!recordWonCampaignProgress(cachedLocalStorage(), state)) {
      onSaveError("Couldn't save campaign progress. Check browser storage, then try leaving again.", leaveWithoutSave);
      return false;
    }
    const status = saveSession.write(state, "implicit");
    if (status === "saved") return true;
    onSaveError(status === "conflict"
      ? "This campaign changed in another tab. Use Save Mission or Load Mission to resolve it before leaving."
      : "Couldn't save your latest progress. Check browser storage, then try leaving again.", leaveWithoutSave);
    return false;
  }, [onSaveError, saveSession, stateRef, tutorial]);

  const navigate = useCallback((path: string) => {
    if (prepareLeave(() => router.push(path))) router.push(path);
  }, [prepareLeave, router]);

  const viewMissionBriefing = useCallback(() => {
    navigate(briefingPath(stateRef.current.seed, stateRef.current.missionIndex, true, "result"));
  }, [navigate, stateRef]);

  const exitTutorial = useCallback(() => {
    navigate(menuPath());
  }, [navigate]);

  const backTutorial = useCallback(() => {
    navigate(menuPath());
  }, [navigate]);

  const resultPrimary = useCallback(() => {
    navigate(resultPrimaryPath(stateRef.current));
  }, [navigate, stateRef]);

  const goHomeNow = useCallback(() => navigate(menuPath()), [navigate]);
  const goNextBriefing = useCallback(() => {
    const world = stateRef.current;
    if (world.missionIndex >= MISSION_MAX) {
      navigate(campaignCompletePath(world.seed));
      return;
    }
    navigate(briefingPath(world.seed, world.missionIndex + 1, false, "result"));
  }, [navigate, stateRef]);
  const goCampaignVictory = useCallback(() => {
    navigate(campaignCompletePath(stateRef.current.seed));
  }, [navigate, stateRef]);
  const goCampaignMap = useCallback(() => {
    navigate(campaignPath(stateRef.current.seed));
  }, [navigate, stateRef]);
  const goRetry = useCallback(() => {
    if (tutorial) {
      navigate(tutorialPath());
      return;
    }
    const world = stateRef.current;
    navigate(briefingPath(world.seed, world.missionIndex, false, "result"));
  }, [navigate, stateRef, tutorial]);

  return {
    router,
    prepareLeave,
    viewMissionBriefing,
    exitTutorial,
    backTutorial,
    resultPrimary,
    goHomeNow,
    goNextBriefing,
    goCampaignVictory,
    goCampaignMap,
    goRetry,
  };
}

import { clearMusicPosition } from "@/lib/audio/music";
import { campaignKey, readCampaignProgress, writeCampaignProgress } from "@/lib/persist/campaign";
import { persistDeploymentEdge } from "@/lib/persist/deploymentEdge";
import { consumeFreshLaunchIntent, consumeResultReturnSnapshot } from "@/lib/persist/navigation";
import {
  cachedCampaignStorage,
  cachedLocalStorage,
  getSaveRepository,
  readSave,
  readSlot,
  safeGetItem,
} from "@/lib/persist/save";
import { restoreSlot } from "@/lib/persist/save/restore";
import { readTelemetry } from "@/lib/persist/telemetry";
import { createMission } from "@/lib/sim/api";
import { deploymentEdgeForMission } from "@/lib/sim/fieldIdentity";
import { campaignProficiencyBand } from "@/lib/sim/proficiency";
import { createTutorialMission } from "@/lib/sim/tutorial";
import type { CampaignProgress, DeploymentEdge, SimState } from "@/lib/types";

function isBrowserReload(): boolean {
  if (typeof window === "undefined") return false;

  const navigation = window.performance?.getEntriesByType?.("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (navigation) return navigation.type === "reload";

  // Keep compatibility with browsers that only expose the legacy navigation API.
  const legacyNavigation = (window.performance as Performance & { navigation?: { type?: number } })
    .navigation;
  return legacyNavigation?.type === 1;
}

type FreshLaunch = {
  fresh: true;
  progress: CampaignProgress;
  rules: 1 | 2;
  proficiencyBand: ReturnType<typeof campaignProficiencyBand> | undefined;
  deploymentEdge: DeploymentEdge | undefined;
};

function planInitialMission(
  seed: number,
  mission: number,
  resume: boolean,
  tutorial: boolean,
  fresh = false,
  slotId?: string | null,
): SimState | FreshLaunch {
  if (tutorial) return createTutorialMission();
  if (slotId && typeof window !== "undefined" && getSaveRepository()?.mode !== "indexeddb") {
    const isReload = isBrowserReload();
    const saved = readSave(cachedCampaignStorage(), seed);
    if (isReload && saved && (resume || saved.missionIndex === mission)) {
      return saved;
    }
    const slot = readSlot(cachedCampaignStorage(), slotId);
    if (slot && slot.state.seed === seed) {
      const error = restoreSlot(cachedLocalStorage(), slot);
      if (error) throw new Error(error);
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has("slot")) {
          url.searchParams.delete("slot");
          url.searchParams.set("resume", "1");
          window.history.replaceState(null, "", url.toString());
        }
      } catch {
        // Ignore URL replace errors in unsupported environments
      }
      return slot.state;
    }
  }
  const freshLaunchIntent = consumeFreshLaunchIntent(seed, mission);
  const startFresh = fresh && (freshLaunchIntent || !isBrowserReload());
  if (startFresh) {
    clearMusicPosition("mission", seed, mission);
  }
  if (!startFresh && typeof window !== "undefined") {
    if (resume) {
      const resultState = consumeResultReturnSnapshot(seed, mission);
      if (resultState) return resultState;
    }
    const saved = readSave(cachedCampaignStorage(), seed);
    if (saved && (resume || saved.missionIndex === mission)) return saved;
  }
  const progress = readCampaignProgress(cachedCampaignStorage(), seed);
  if (safeGetItem(cachedCampaignStorage(), campaignKey(seed)) === null) {
    const previous = readSave(cachedCampaignStorage(), seed);
    if (previous) progress.gameplayRulesVersion = previous.gameplayRulesVersion ?? 1;
  }
  const rules = progress.gameplayRulesVersion ?? 2;
  const proficiencyBand =
    typeof window === "undefined"
      ? undefined
      : campaignProficiencyBand(readTelemetry(cachedLocalStorage()));
  const deploymentEdge =
    typeof window === "undefined" ? undefined : deploymentEdgeForMission(progress, mission);
  if (deploymentEdge) delete progress.deploymentEdge;
  return { fresh: true, progress, rules, proficiencyBand, deploymentEdge };
}

function isFreshLaunch(value: SimState | FreshLaunch): value is FreshLaunch {
  return "fresh" in value && value.fresh === true;
}

function missionFromFreshLaunch(seed: number, mission: number, launch: FreshLaunch): SimState {
  return createMission({
    seed,
    missionIndex: mission,
    gameplayRulesVersion: launch.rules,
    proficiencyBand: launch.proficiencyBand,
    deploymentEdge: launch.deploymentEdge,
  });
}

/**
 * IndexedDB owns the campaign record. Rewriting the legacy envelope changes
 * savedAt, and the next open treats that as a new import: it bumps the
 * autosave revision and can file the crash journal as an interrupted save.
 * A failed reward clear still leaves a newer legacy envelope so the next open
 * can drop the reward without touching that revision.
 */
function persistFreshLaunch(seed: number, launch: FreshLaunch): Promise<void> | void {
  if (typeof window === "undefined") return;
  const repository = getSaveRepository();
  if (repository?.mode === "indexeddb") {
    if (!launch.deploymentEdge) return;
    return repository.setDeploymentEdge(seed, undefined).then((cleared) => {
      if (!cleared) writeCampaignProgress(cachedLocalStorage(), launch.progress);
    });
  }
  writeCampaignProgress(cachedLocalStorage(), launch.progress);
  if (launch.deploymentEdge) persistDeploymentEdge(seed, undefined);
}

export function initialMission(
  seed: number,
  mission: number,
  resume: boolean,
  tutorial: boolean,
  fresh = false,
  slotId?: string | null,
): SimState {
  const launch = planInitialMission(seed, mission, resume, tutorial, fresh, slotId);
  if (!isFreshLaunch(launch)) return launch;
  const pending = persistFreshLaunch(seed, launch);
  if (pending) void pending.catch(() => undefined);
  return missionFromFreshLaunch(seed, mission, launch);
}

export async function prepareInitialMission({
  seed,
  mission,
  resume,
  fresh = false,
  slot,
}: {
  seed: number;
  mission: number;
  resume: boolean;
  fresh?: boolean;
  slot?: string;
}): Promise<SimState> {
  const repository = getSaveRepository();
  if (slot && repository) {
    const saved = readSave(cachedCampaignStorage(), seed);
    if (isBrowserReload() && saved && (resume || saved.missionIndex === mission)) return saved;
    const named = readSlot(cachedCampaignStorage(), slot);
    if (named && named.state.seed === seed) {
      const error = await repository.restoreSlot(named);
      if (error) throw new Error(error);
      const url = new URL(window.location.href);
      url.searchParams.delete("slot");
      url.searchParams.set("resume", "1");
      window.history.replaceState(window.history.state, "", url.toString());
      return named.state;
    }
  }
  if (resume) {
    const resultState = consumeResultReturnSnapshot(seed, mission);
    if (resultState) return resultState;
  }
  if (repository?.mode === "indexeddb") {
    const launch = planInitialMission(seed, mission, resume, false, fresh);
    if (!isFreshLaunch(launch)) return launch;
    await persistFreshLaunch(seed, launch);
    return missionFromFreshLaunch(seed, mission, launch);
  }
  return initialMission(seed, mission, resume, false, fresh);
}

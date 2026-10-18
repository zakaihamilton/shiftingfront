import type { CampaignProgress, GameplayRulesVersion, SimState } from "../types";

export const JOURNAL_PREFIX = "shiftingfront:journal:";
export const RULES_REBUILD_NOTICE = "An in-progress operation from the previous campaign rules was rebuilt. Campaign progress was kept.";
export const LEGACY_RULES_IMPORT_NOTICE = "That save used the previous campaign rules. Its battle was retired and its campaign record was kept.";

export type RetiredSlot = {
  id: string;
  state: SimState;
  campaign: CampaignProgress;
};

export type RulesRetirementSnapshot = {
  seed: number;
  progress: CampaignProgress | null;
  autosave: SimState | null;
  slots: readonly RetiredSlot[];
  journal: { state: SimState; progress: CampaignProgress } | null;
};

export type RulesRetirementPlan = {
  progress: CampaignProgress;
  dropAutosave: boolean;
  dropSlotIds: string[];
  dropJournal: boolean;
  /** A battlefield was discarded, so the player needs to be told. */
  rebuilt: boolean;
};

export function journalKey(seed: number): string {
  return `${JOURNAL_PREFIX}${seed.toString().padStart(4, "0")}`;
}

export function isCurrentGameplayRules(version: GameplayRulesVersion | undefined): boolean {
  return version === 2;
}

function blankProgress(seed: number): CampaignProgress {
  return {
    gameplayRulesVersion: 2,
    version: 1,
    seed,
    tutorialComplete: false,
    unlockedMission: 0,
    completedMissions: [],
    medals: {},
    bestScores: {},
  };
}

function maxStats(left: Record<string, number>, right: Record<string, number>): Record<string, number> {
  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (!/^[0-5]$/.test(key) || !Number.isFinite(value) || value < 0) continue;
    merged[key] = Math.max(merged[key] ?? 0, value);
  }
  return merged;
}

export function mergeCampaignProgress(left: CampaignProgress, right: CampaignProgress): CampaignProgress {
  if (left.seed !== right.seed) return left;
  const completed = [...new Set([...left.completedMissions, ...right.completedMissions])]
    .filter((mission) => mission >= 0 && mission <= 5)
    .sort((a, b) => a - b);
  const unlockedMission = Math.min(5, Math.max(left.unlockedMission, right.unlockedMission, ...completed, 0));
  return {
    version: 1,
    seed: left.seed,
    tutorialComplete: left.tutorialComplete || right.tutorialComplete,
    unlockedMission,
    completedMissions: completed.filter((mission) => mission <= unlockedMission),
    medals: maxStats(left.medals, right.medals),
    bestScores: maxStats(left.bestScores, right.bestScores),
    gameplayRulesVersion: left.gameplayRulesVersion === 2 || right.gameplayRulesVersion === 2 ? 2 : 1,
  };
}

/** Keep the campaign record and the mission the player had reached. Drop the battlefield. */
export function progressAfterRetiredBattlefield(
  existing: CampaignProgress | null,
  incoming: CampaignProgress,
  missionIndex: number,
): CampaignProgress {
  const merged = mergeCampaignProgress(existing ?? blankProgress(incoming.seed), incoming);
  const unlockedMission = Math.min(5, Math.max(merged.unlockedMission, missionIndex));
  return {
    ...merged,
    seed: incoming.seed,
    gameplayRulesVersion: 2,
    unlockedMission,
    completedMissions: merged.completedMissions.filter((mission) => mission <= unlockedMission),
  };
}

/**
 * Rules 2 replaces a rules 1 battlefield. The plan keeps unlocks, medals, and
 * scores, and names every autosave, slot, and journal that would resume the old operation.
 * Returns null when the seed is already on the current rules.
 */
export function planSeedRetirement(snapshot: RulesRetirementSnapshot): RulesRetirementPlan | null {
  const legacySlots = snapshot.slots.filter((slot) => !isCurrentGameplayRules(slot.state.gameplayRulesVersion));
  const legacyAutosave = snapshot.autosave && !isCurrentGameplayRules(snapshot.autosave.gameplayRulesVersion) ? snapshot.autosave : null;
  const legacyJournal = snapshot.journal && !isCurrentGameplayRules(snapshot.journal.state.gameplayRulesVersion) ? snapshot.journal : null;
  const legacyProgress = snapshot.progress !== null && !isCurrentGameplayRules(snapshot.progress.gameplayRulesVersion);
  if (legacySlots.length === 0 && !legacyAutosave && !legacyJournal && !legacyProgress) return null;

  let progress = snapshot.progress ?? blankProgress(snapshot.seed);
  if (legacyJournal) progress = mergeCampaignProgress(progress, legacyJournal.progress);
  for (const slot of legacySlots) progress = mergeCampaignProgress(progress, slot.campaign);
  const battlefields = [legacyAutosave, legacyJournal?.state, ...legacySlots.map((slot) => slot.state)];
  for (const battlefield of battlefields) {
    if (!battlefield) continue;
    progress = {
      ...progress,
      unlockedMission: Math.min(5, Math.max(progress.unlockedMission, battlefield.missionIndex)),
    };
  }
  progress = {
    ...progress,
    version: 1,
    seed: snapshot.seed,
    gameplayRulesVersion: 2,
    completedMissions: progress.completedMissions.filter((mission) => mission <= progress.unlockedMission),
  };
  return {
    progress,
    dropAutosave: legacyAutosave !== null,
    dropSlotIds: legacySlots.map((slot) => slot.id),
    dropJournal: legacyJournal !== null,
    rebuilt: legacyAutosave !== null || legacySlots.length > 0 || legacyJournal !== null,
  };
}

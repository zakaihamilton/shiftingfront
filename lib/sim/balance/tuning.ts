import type { Campaign, MissionKind } from "../../types";
export type PacingCandidate = { group: "routes" | "quotas"; multiplier: 0.75 | 1 | 1.25 | 1.5 };
export function affectedByPacingCandidate(kind: MissionKind, group: PacingCandidate["group"]) {
  return group === "routes" ? kind === "rescue" || kind === "escort" : kind === "harvestQuota" || kind === "forceQuota" || kind === "structureQuota";
}
/** Diagnostics only. Production missions always use the committed rules constants. */
export function pacingCandidateCampaign(campaign: Campaign, candidate?: PacingCandidate): Campaign {
  if (!candidate) return campaign;
  return { ...campaign, missions: campaign.missions.map(m => !affectedByPacingCandidate(m.win.kind, candidate.group) ? m : ({
    ...m,
    mapSize: candidate.group === "routes" ? Math.round(m.mapSize * candidate.multiplier) : m.mapSize,
    win: candidate.group === "quotas" && m.win.target !== undefined ? { ...m.win, target: Math.max(1, Math.round(m.win.target * candidate.multiplier)) } : m.win,
  })) };
}

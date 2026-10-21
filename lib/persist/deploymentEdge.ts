import { campaignKey, readCampaignProgress, writeCampaignProgress } from "./campaign";
import { cachedCampaignStorage, getSaveRepository } from "./save";
import { deploymentEdgeForMission } from "../sim/fieldIdentity";
import type { DeploymentEdge } from "../types";

export function persistDeploymentEdge(seed: number, edge: DeploymentEdge | undefined): void {
  const repository = getSaveRepository();
  if (repository) {
    void repository.setDeploymentEdge(seed, edge);
    return;
  }
  const storage = cachedCampaignStorage();
  const progress = readCampaignProgress(storage, seed);
  if (edge) progress.deploymentEdge = edge;
  else delete progress.deploymentEdge;
  writeCampaignProgress(storage, progress);
}

/** Reads the reward for this mission index and clears it so a reload does not apply it twice. */
export function takeDeploymentEdge(seed: number, missionIndex: number): DeploymentEdge | undefined {
  const storage = cachedCampaignStorage();
  const progress = readCampaignProgress(storage, seed);
  const edge = deploymentEdgeForMission(progress, missionIndex);
  if (!edge) return undefined;
  persistDeploymentEdge(seed, undefined);
  return edge;
}

export function deploymentEdgeKey(seed: number): string {
  return campaignKey(seed);
}

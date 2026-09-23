import { createCampaign } from "../../../lib/gen/campaign";
import { generateMap } from "../../../lib/gen/map";
import { createMission, createMissionFromData } from "../../../lib/sim/api";
import { cloneMapForSimulation } from "../../../lib/sim/balance";

export function missionFactory(seed: number, missionIndex: number) {
  const campaign = createCampaign(seed);
  const mission = campaign.missions[missionIndex];
  if (!mission) throw new Error(`No mission ${missionIndex} for seed ${seed}`);
  const map = generateMap(seed, mission);
  return () => createMissionFromData({
    seed,
    missionIndex,
    campaign,
    mission,
    map: cloneMapForSimulation(map),
  });
}

export function withoutFog(state: ReturnType<typeof createMission>) {
  const { fog: _fog, ...outcomeState } = state;
  void _fog;
  return outcomeState;
}

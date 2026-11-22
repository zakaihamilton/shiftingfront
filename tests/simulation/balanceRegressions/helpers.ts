import { createCampaign } from "../../../lib/gen/campaign";
import { generateMap } from "../../../lib/gen/map";
import { MAX_OPERATION_TICKS } from "../../../lib/gen/pacing";
import {
  type BalanceScenario,
  balanceFailureReason,
  cloneMapForSimulation,
  runOne,
  type SharedScenarioData,
  stableBalanceRecords,
  validMap,
} from "../../../lib/sim/balance";

export const COMPETENT_EDGE_SCENARIOS: BalanceScenario[] = [
  { seed: 1, mission: 5 },
  { seed: 2, mission: 4 },
  { seed: 12, mission: 5 },
  { seed: 16, mission: 5 },
  { seed: 22, mission: 4 },
  { seed: 26, mission: 3 },
  { seed: 28, mission: 4 },
  { seed: 29, mission: 5 },
  { seed: 30, mission: 2 },
  { seed: 33, mission: 5 },
  { seed: 38, mission: 5 },
  { seed: 39, mission: 5 },
];

const PREPARED_EDGE_SCENARIOS = COMPETENT_EDGE_SCENARIOS.map(({ seed, mission }) => {
  const campaign = createCampaign(seed);
  const definition = campaign.missions[mission];
  if (!definition) throw new Error(`No mission ${mission} for seed ${seed}`);
  const map = generateMap(seed, definition);
  const sharedScenario: SharedScenarioData = { mapValid: validMap(map) };
  return { seed, mission, campaign, map, sharedScenario };
});

export function runEdgeScenarios(start: number, end: number) {
  return PREPARED_EDGE_SCENARIOS.slice(start, end).map(
    ({ seed, mission, campaign, map, sharedScenario }) =>
      runOne(
        seed,
        mission,
        "competent",
        MAX_OPERATION_TICKS,
        campaign,
        cloneMapForSimulation(map),
        sharedScenario,
      ),
  );
}

export function assertEdgeScenarioRecords(
  records: ReturnType<typeof runEdgeScenarios>,
  expectedLabels: string[],
): void {
  const stable = stableBalanceRecords(records);
  const labels = records.map((record) => `${record.seed} / M${record.mission ?? -1}`);
  if (JSON.stringify(labels) !== JSON.stringify(expectedLabels))
    throw new Error(`Unexpected records: ${labels.join(", ")}`);
  expectStableRecords(stable);
}

function expectStableRecords(records: ReturnType<typeof stableBalanceRecords>): void {
  for (const record of records) {
    if (
      !record.mapValid ||
      !record.targetReachable ||
      record.commandRejections !== 0 ||
      record.powerDeficit ||
      record.nonFiniteState
    )
      throw new Error("Infrastructure failure");
    if (record.result === "lost") {
      if (!record.lossReason || record.failureReason !== record.lossReason)
        throw new Error("Missing loss reason");
    } else if (record.result === "playing" && (record.truncated || record.duration <= 0)) {
      throw new Error("Unexpected truncated record");
    }
    if (record.failureReason !== balanceFailureReason(record))
      throw new Error("Unexpected failure classification");
  }
}

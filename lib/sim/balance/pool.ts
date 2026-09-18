import { Worker } from "node:worker_threads";
import { defaultBalanceJobs, balanceScenarios } from "./sampling";
import { assertWithinDeadline, runBalanceSweepJob } from "./runner";
import type {
  BalanceProgress,
  BalanceRecordWithScenario,
  BalanceRunJob,
  BalanceRunOptions,
  BalanceScenario,
  BalanceSweepJob,
} from "./types";
import type { BalanceRecord } from "./evaluation";

export function sortBalanceRecords(records: BalanceRecordWithScenario[]): BalanceRecordWithScenario[] {
  return [...records].sort((a, b) => Number(a.seed) - Number(b.seed)
    || a.mission - b.mission
    || (a.strategy ?? "competent").localeCompare(b.strategy ?? "competent"));
}

export function runWorker(
  job: BalanceRunJob,
  onRecord?: (record: BalanceRecordWithScenario) => void,
): Promise<BalanceRecordWithScenario[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../../scripts/balanceWorker.cjs", import.meta.url), {
      workerData: {
        from: job.from,
        to: job.to,
        missions: job.missions,
        maxTicks: job.maxTicks,
        deadlineAt: job.deadlineAt,
        strategy: job.strategy,
        scenarios: job.scenarios,
      },
    });
    worker.on("message", (message: { type: "progress" | "complete"; record?: BalanceRecordWithScenario; records?: BalanceRecordWithScenario[] }) => {
      if (message.type === "progress" && message.record) onRecord?.(message.record);
      if (message.type === "complete" && message.records) resolve(message.records);
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`Balance worker exited with code ${code}`));
    });
  });
}

type BalanceSweepWorkerMessage =
  | { type: "progress"; record: BalanceRecordWithScenario }
  | { type: "complete"; records: BalanceRecordWithScenario[] }
  | { type: "error"; message: string };

export function groupScenariosBySeed(scenarios: BalanceScenario[]): BalanceScenario[][] {
  const groupedBySeed = new Map<number, BalanceScenario[]>();
  for (const scenario of scenarios) {
    const group = groupedBySeed.get(scenario.seed) ?? [];
    group.push(scenario);
    groupedBySeed.set(scenario.seed, group);
  }
  return [...groupedBySeed.values()];
}

export function runSweepWorkerPool(
  options: Omit<BalanceSweepJob, "scenarios">,
  seedGroups: BalanceScenario[][],
  workerCount: number,
  onRecord: (record: BalanceRecordWithScenario) => void,
): Promise<BalanceRecordWithScenario[]> {
  return new Promise((resolve, reject) => {
    const workers: Array<{ worker: Worker; closing: boolean }> = [];
    const records: BalanceRecordWithScenario[] = [];
    let nextGroup = 0;
    let closedWorkers = 0;
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      for (const entry of workers) void entry.worker.terminate();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const dispatch = (entry: { worker: Worker; closing: boolean }) => {
      const scenarios = seedGroups[nextGroup++];
      if (!scenarios) {
        entry.closing = true;
        entry.worker.postMessage({ type: "close" });
        return;
      }
      entry.worker.postMessage({ type: "run", scenarios });
    };

    for (let index = 0; index < workerCount; index++) {
      const entry = {
        worker: new Worker(new URL("../../../scripts/balanceSweepWorker.cjs", import.meta.url), {
          workerData: {
            from: options.from,
            to: options.to,
            missions: options.missions,
            maxTicks: options.maxTicks,
            deadlineAt: options.deadlineAt,
            strategies: options.strategies,
          },
        }),
        closing: false,
      };
      workers.push(entry);
      entry.worker.on("message", (message: BalanceSweepWorkerMessage) => {
        if (settled) return;
        if (message.type === "progress") {
          onRecord(message.record);
          return;
        }
        if (message.type === "error") {
          fail(new Error(message.message));
          return;
        }
        records.push(...message.records);
        dispatch(entry);
      });
      entry.worker.once("error", fail);
      entry.worker.once("exit", (code) => {
        if (settled) return;
        if (code !== 0) {
          fail(new Error(`Balance sweep worker exited with code ${code}`));
          return;
        }
        if (entry.closing) {
          closedWorkers += 1;
          if (closedWorkers === workers.length) {
            settled = true;
            resolve(records);
          }
        }
      });
      dispatch(entry);
    }
  });
}

export async function runBalanceSweepScenarios(
  options: Omit<BalanceSweepJob, "scenarios"> & {
    jobs?: number;
    onProgress?: (progress: BalanceProgress) => void;
    scenarioList?: BalanceScenario[];
  },
): Promise<BalanceRecordWithScenario[]> {
  const scenarios = options.scenarioList ?? balanceScenarios(options);
  const seedGroups = groupScenariosBySeed(scenarios);
  const requestedJobs = options.jobs ?? defaultBalanceJobs(scenarios.length);
  const jobs = Math.max(1, Math.min(Math.floor(requestedJobs) || 1, seedGroups.length || 1));
  let completed = 0;
  const report = (record: BalanceRecordWithScenario) => {
    assertWithinDeadline(options.deadlineAt);
    completed += 1;
    options.onProgress?.({ completed, total: scenarios.length * options.strategies.length, record });
  };
  const jobOptions = {
    from: options.from,
    to: options.to,
    missions: options.missions,
    maxTicks: options.maxTicks,
    deadlineAt: options.deadlineAt,
    strategies: options.strategies,
  };
  if (jobs === 1 || seedGroups.length < 2) {
    return sortBalanceRecords(runBalanceSweepJob({ ...jobOptions, scenarios }, report));
  }
  const records = await runSweepWorkerPool(jobOptions, seedGroups, jobs, report);
  return sortBalanceRecords(records);
}

export async function runBalanceScenarios(
  options: BalanceRunOptions & {
    jobs?: number;
    onProgress?: (progress: BalanceProgress) => void;
    scenarioList?: BalanceScenario[];
  },
): Promise<BalanceRecordWithScenario[]> {
  return runBalanceSweepScenarios({
    ...options,
    strategies: [options.strategy ?? "competent"],
  });
}

/** Remove machine timing so gameplay records can be compared byte-for-byte. */
export function stableBalanceRecords(records: BalanceRecordWithScenario[]): BalanceRecord[] {
  return sortBalanceRecords(records).map(({ scenarioMs: _scenarioMs, ...record }) => {
    void _scenarioMs;
    return record;
  });
}

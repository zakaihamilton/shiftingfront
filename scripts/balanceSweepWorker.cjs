/* eslint-disable @typescript-eslint/no-require-imports */
require("tsx/cjs");

const { parentPort, workerData } = require("node:worker_threads");
const { createBalanceSweepCache, runBalanceSweepJob } = require("../lib/sim/balance/runner.ts");

if (!parentPort) throw new Error("Balance sweep worker requires a parent port");

const cache = createBalanceSweepCache();

parentPort.on("message", (message) => {
  if (message?.type === "close") {
    parentPort.close();
    return;
  }
  if (message?.type !== "run" || !Array.isArray(message.scenarios) || !Array.isArray(message.strategies)) return;
  try {
    const records = runBalanceSweepJob(
      { ...workerData, scenarios: message.scenarios, strategies: message.strategies },
      (record) => parentPort.postMessage({ type: "progress", record }),
      cache,
    );
    parentPort.postMessage({ type: "complete", records });
  } catch (error) {
    parentPort.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

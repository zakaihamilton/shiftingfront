require("tsx/cjs");

const { parentPort, workerData } = require("node:worker_threads");
const { runBalanceJob } = require("../lib/sim/balance/runner.ts");

if (!parentPort) throw new Error("Balance worker requires a parent port");
const records = runBalanceJob(workerData, (record) => {
  parentPort.postMessage({ type: "progress", record });
});
parentPort.postMessage({ type: "complete", records });

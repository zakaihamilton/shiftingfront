import { readFileSync } from "node:fs";
import { parseSeed } from "../lib/seed/rng";
import { runReplay, type TimedOrder } from "../lib/sim/replay";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  return fallback;
}

const seedRaw = arg("seed", "0000")!;
const seed = parseSeed(seedRaw);
if (seed === null) {
  console.error("Usage: pnpm sim --seed 0421 --mission 0 --ticks 200");
  process.exit(1);
}

const missionIndex = Number(arg("mission", "0"));
const ticks = Number(arg("ticks", "200"));
const ordersPath = arg("orders");

let orders: TimedOrder[] = [];
if (ordersPath) {
  orders = JSON.parse(readFileSync(ordersPath, "utf8")) as TimedOrder[];
}

const report = runReplay({ seed, missionIndex, orders, maxTicks: ticks }).inspect;
console.log(JSON.stringify(report, null, 2));
if (report.result === "won") process.exit(10);
if (report.result === "lost") process.exit(11);
process.exit(0);

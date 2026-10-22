import assert from "node:assert/strict";
import { createMission, tick } from "../../lib/sim/api";

// Standalone retained-heap measurement. Vitest's thread workers cannot be
// started with --expose-gc, so the stress test launches this file directly.
const collect = global.gc;
if (typeof collect !== "function") {
  throw new Error("long-session heap probe requires node --expose-gc");
}

collect();
const memoryBefore = process.memoryUsage().heapUsed;
const missionCount = 5;
const ticksPerMission = 1000;

for (let missionIndex = 0; missionIndex < missionCount; missionIndex++) {
  const state = createMission({ seed: 100 + missionIndex, missionIndex });
  assert.ok(state.entities.length > 0, `mission ${missionIndex} spawned no entities`);

  for (let step = 0; step < ticksPerMission; step++) tick(state);

  assert.equal(state.tick, ticksPerMission, `mission ${missionIndex} tick`);
  for (const entity of state.entities) {
    assert.equal(Number.isFinite(entity.x), true);
    assert.equal(Number.isFinite(entity.y), true);
    assert.equal(Number.isFinite(entity.hp), true);
    assert.ok(entity.x >= 0 && entity.x <= state.width, `entity ${entity.id} x`);
    assert.ok(entity.y >= 0 && entity.y <= state.height, `entity ${entity.id} y`);
  }
  assert.ok(state.entities.length < 500, `mission ${missionIndex} entity count ${state.entities.length}`);
}

collect();
const heapGrowthMb = (process.memoryUsage().heapUsed - memoryBefore) / (1024 * 1024);
process.stdout.write(JSON.stringify({ heapGrowthMb }));

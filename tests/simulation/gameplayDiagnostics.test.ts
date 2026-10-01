import { describe, expect, it } from "vitest";
import { completionTiming } from "../../lib/sim/balance/evaluation/aggregation";
import { createEngagement, ENGAGEMENT_SCENARIOS, runEngagement, tickEngagement } from "../../lib/sim/balance/engagements";
import { BUILDING_STATS, UNIT_STATS } from "../../lib/catalog";
import { powerFor } from "../../lib/sim/world";
import { runBalanceJob } from "../../lib/sim/balance/runner";
import { runBalanceScenarios } from "../../lib/sim/balance/pool";
import { makeFixture, addBuilding, addUnit } from "../../lib/sim/fixtures";
import { AdvancedCommander } from "../../lib/sim/commander/advanced";
import { issue } from "../../lib/sim/api";
import { planProduction } from "../../lib/sim/commander/production";
import { advancedDominance } from "../../lib/sim/balance/evaluation/advanced";
import type { BalanceRecord } from "../../lib/sim/balance/evaluation/types";

describe("gameplay diagnostics", () => {
  it("orders enemy counter units to advance and explicitly target the repair truck", () => {
    const counters = createEngagement("dispersedAntiArmor");
    expect(counters.squads[1].every(unit => unit.orderMode === "attackMove" && !unit.idle)).toBe(true);
    const targeting = createEngagement("supportTargeting");
    const truck = targeting.squads[0].find(unit => unit.kind === "repairTruck")!;
    expect(targeting.squads[1].every(unit => unit.orderMode === "attack" && unit.attackTarget === truck.id && !unit.idle)).toBe(true);
  });

  it("powers both sides of the anti-air arena and charges for their infrastructure", () => {
    const { state, investment } = createEngagement("antiAir");
    expect(powerFor(state, 0)).toBe(40);
    expect(powerFor(state, 1)).toBe(10);
    expect(investment).toEqual([
      UNIT_STATS.strikePlane.cost + BUILDING_STATS.runway.cost + BUILDING_STATS.power.cost,
      4 * BUILDING_STATS.antiAirTurret.cost + BUILDING_STATS.power.cost,
    ]);
  });

  it("advances aircraft by one normal movement step per arena tick", () => {
    const { state, squads } = createEngagement("antiAir");
    const plane = squads[0][0];
    const start = { x: plane.x, y: plane.y };
    tickEngagement(state);
    expect(state.tick).toBe(1);
    expect(Math.hypot(plane.x - start.x, plane.y - start.y)).toBeCloseTo(UNIT_STATS.strikePlane.speed);
  });
  it("includes an exact ten-point advantage and rejects undersampled dominance", () => {
    const records = [...Array(10)].flatMap((_, index) => [
      { strategy: "competent", kind: "annihilate", result: index < 9 ? "won" : "lost", duration: 1 },
      { strategy: "behemoths", kind: "annihilate", result: "won", duration: 1 },
    ]) as BalanceRecord[];
    expect(advancedDominance(records)).toHaveLength(1);
    expect(advancedDominance(records.slice(0, 14))).toEqual([]);
  });
  it("reserves and spends late-game credits on the requested heavy unit", () => {
    const state = makeFixture({ width: 40, height: 32, win: { kind: "annihilate" } });
    state.gameplayRulesVersion = 2;
    state.tick = 5000;
    addBuilding(state, 0, "power", 2, 2);
    addBuilding(state, 0, "barracks", 8, 2);
    addBuilding(state, 0, "factory", 15, 2);
    addUnit(state, 0, "harvester", 12, 20);
    addUnit(state, 0, "harvester", 14, 20);
    state.credits[0] = 1200;
    expect(planProduction(state)).toEqual([]);
    state.credits[0] = 2000;
    expect(planProduction(state)[0]).toMatchObject({ type: "produce", unit: "behemoth" });
  });
  it("validates repaired alternate lanes and searches large rescue maps completely", () => {
    for (const [seed, mission] of [[40, 0], [69, 4]]) {
      const [record] = runBalanceJob({ from: seed, to: seed, missions: [mission], scenarios: [{ seed, mission }], gameplayRulesVersion: 2, maxTicks: 1 });
      expect(record.mapValid).toBe(true);
    }
  });
  it("reports completion percentiles from wins only", () => {
    const records = [{ result: "won", duration: 3600 }, { result: "won", duration: 8640 }, { result: "lost", duration: 1 }] as BalanceRecord[];
    expect(completionTiming(records)).toEqual({ median: 3600, p90: 8640, inTargetWindowRate: 1 });
    expect(completionTiming([])).toEqual({ median: null, p90: null, inTargetWindowRate: 0 });
  });
  it("carries rules version through both serial and worker balance paths", async () => {
    const options = { from: 0, to: 0, missions: [0, 1], gameplayRulesVersion: 2 as const, maxTicks: 12 };
    const serial = await runBalanceScenarios({ ...options, jobs: 1 });
    const parallel = await runBalanceScenarios({ ...options, jobs: 2 });
    expect(serial.map(r => r.nearestResourceDistance)).toEqual(parallel.map(r => r.nearestResourceDistance));
    expect(serial[0].baselineRouteLength).not.toBe(runBalanceJob({ ...options, gameplayRulesVersion: 1, scenarios: [{seed:0,mission:0}] })[0].baselineRouteLength);
    expect(serial[0].runOutcome).toBe("runnerTruncated");
    expect(serial[0].firstDamageTick).toBeUndefined();
  });
  it.each(ENGAGEMENT_SCENARIOS)("runs deterministic equal-investment %s engagements", scenario => {
    const a = runEngagement(scenario, 1);
    expect(a).toEqual(runEngagement(scenario, 1));
    expect(a.shots).toBeGreaterThan(0);
    expect(Math.abs(a.investment[0] - a.investment[1]) / Math.max(...a.investment)).toBeLessThanOrEqual(0.11);
  });
  it.each(["behemoths", "aircraft", "support"] as const)("%s commander issues affordable public orders", strategy => {
    const state = makeFixture({width:40,height:32,win:{kind:"annihilate"}});
    addBuilding(state,0,"constructionYard",2,2);addBuilding(state,0,"power",2,8);
    addBuilding(state,0,"refinery",8,2);addBuilding(state,0,"barracks",8,8);addBuilding(state,0,"factory",13,8);
    const commander = new AdvancedCommander(strategy);
    for (let i=0;i<3;i++) {state.tick=i*24; for(const c of commander.plan(state)) expect(issue(state,c).filter(e=>e.type==="commandRejected")).toEqual([]);}
  });
});

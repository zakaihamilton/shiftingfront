import { BUILDING_STATS, UNIT_STATS } from "../../catalog";
import type { BuildingKind, Entity, SimState, UnitKind } from "../../types";
import { makeFixture, addUnit, addBuilding, setHeight } from "../fixtures";
import { issue } from "../orders";
import { tickMovement } from "../movement";
import { tickCombat } from "../combat";
import { tickSupport } from "../support";
import { resetPathBudget } from "../pathBudget";

export const ENGAGEMENT_SCENARIOS = ["dispersedAntiArmor", "clusteredInfantry", "tanks", "antiAir", "highGround", "supportTargeting"] as const;
export type EngagementScenario = typeof ENGAGEMENT_SCENARIOS[number];

/** Build the arena separately so its orders and infrastructure can be verified. */
export function createEngagement(scenario: EngagementScenario, seed = 0) {
  const state = makeFixture({ width: 40, height: 32, seed, win: { kind: "annihilate" } });
  const squads: [Entity[], Entity[]] = [[], []];
  const cost: [number, number] = [0, 0];
  const add = (owner: 0 | 1, kind: UnitKind, x: number, y: number) => {
    const e = addUnit(state, owner, kind, x, y);
    squads[owner].push(e); cost[owner] += UNIT_STATS[kind].cost;
    return e;
  };
  const infrastructure = (owner: 0 | 1, kind: BuildingKind, x: number, y: number) => {
    cost[owner] += BUILDING_STATS[kind].cost;
    return addBuilding(state, owner, kind, x, y);
  };
  if (scenario === "antiAir") {
    infrastructure(0, "power", 2, 7);
    infrastructure(1, "power", 33, 3);
    const runway = infrastructure(0, "runway", 3, 3);
    const plane = add(0, "strikePlane", 13, 16);
    plane.flightState = "airborne"; plane.ammo = 3; plane.maxAmmo = 3;
    plane.assignedRunwayId = runway.id; runway.assignedPlaneId = plane.id;
    for (let i = 0; i < 4; i++) squads[1].push(infrastructure(1, "antiAirTurret", 21 + i % 2 * 3, 14 + Math.floor(i / 2) * 3));
  } else if (scenario === "supportTargeting") {
    add(0, "tank", 14, 15); add(0, "tank", 14, 18); const truck = add(0, "repairTruck", 11, 16);
    for (let i = 0; i < 7; i++) add(1, "antiArmor", 20 + i % 2, 10 + i * 2);
    issue(state, { type: "attack", owner: 1, unitIds: squads[1].map(e => e.id), targetId: truck.id });
  } else {
    add(0, "behemoth", 14, 16);
    const kind: UnitKind = scenario === "tanks" ? "tank" : scenario === "clusteredInfantry" ? "infantry" : "antiArmor";
    const count = kind === "tank" ? 3 : kind === "infantry" ? 16 : 7;
    for (let i = 0; i < count; i++) add(1, kind, 20 + i % 3, kind === "infantry" ? 15 + Math.floor(i / 3) * 0.25 : 8 + i * 2);
    if (scenario === "highGround") for (let y = 4; y < 29; y++) for (let x = 18; x < 30; x++) setHeight(state, x, y, 2);
  }
  for (const owner of [0, 1] as const) {
    if (scenario === "supportTargeting" && owner === 1) continue;
    issue(state, { type: "attackMove", owner, unitIds: squads[owner].filter(e => e.class === "unit").map(e => e.id), x: owner === 0 ? 21 : 14, y: 16 });
  }
  return { state, squads, investment: cost };
}

/** Match the combat portion of the authoritative pipeline; movement advances aircraft. */
export function tickEngagement(state: SimState) {
  resetPathBudget(state);
  tickMovement(state);
  const shots = tickCombat(state).filter(e => e.type === "combat").length;
  const supportActions = tickSupport(state).filter(e => e.type === "support").length;
  state.tick++;
  return { shots, supportActions };
}

/** Equal-investment diagnostic arenas: outcome data, not synthetic balance assertions. */
export function runEngagement(scenario: EngagementScenario, seed = 0) {
  const { state, squads, investment } = createEngagement(scenario, seed);
  const startingHp = squads.map(es => es.reduce((sum,e) => sum + e.hp, 0));
  let shots = 0;
  let supportActions = 0;
  for (let i = 0; i < 1200 && squads.every(es => es.some(e => e.hp > 0)); i++) {
    const tick = tickEngagement(state);
    shots += tick.shots;
    supportActions += tick.supportActions;
  }
  return { scenario, seed, investment, ticks: state.tick, startingHp, remainingHp: squads.map(es => es.reduce((sum,e) => sum + Math.max(0,e.hp),0)), survivors: squads.map(es => es.filter(e => e.hp > 0).map(e => e.kind)), shots, supportActions };
}

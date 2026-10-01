import { BUILDING_STATS, UNIT_STATS, producerFor } from "../../catalog";
import type { Command, SimState, UnitKind } from "../../types";
import { findBuildSite, powerFor } from "../world";
import { CompetentCommander } from "./class";
import { planBuilding } from "./production";
import { COMMANDER_CADENCE, playerBuildingsView, playerUnitsView, queuedUnitCount, readyProducers, totalUnitCount } from "./queries";
import { readSharedProductionQueue, sharedProductionQueueSize } from "../producerState";

export const ADVANCED_STRATEGIES = ["behemoths", "aircraft", "support"] as const;
export type AdvancedStrategy = typeof ADVANCED_STRATEGIES[number];

/** Diagnostic armies use the same objective/maneuver policy and public orders. */
export class AdvancedCommander {
  private readonly tactical = new CompetentCommander();
  constructor(readonly strategy: AdvancedStrategy) {}

  plan(state: SimState): Command[] {
    const orders: Command[] = this.tactical.plan(state).filter(c => c.type !== "produce" && c.type !== "build");
    if (state.result !== "playing" || state.tick % COMMANDER_CADENCE !== 0) return orders;
    const yard = playerBuildingsView(state, "constructionYard")[0];
    if (!yard) return orders;
    let build = planBuilding(state, yard);
    if (!build && this.strategy === "aircraft" && playerBuildingsView(state, "runway").length < 3 && state.credits[0] >= BUILDING_STATS.runway.cost && powerFor(state, 0) >= 10) {
      const site = findBuildSite(state, "runway", yard.x + 3, yard.y, 14, 0);
      if (site) build = { type: "build", building: "runway", x: site.x, y: site.y };
    }
    if (build) return [...orders, build];
    if (powerFor(state, 0) < 0) return orders;
    let bank = state.credits[0];
    const count = (kind: UnitKind) => totalUnitCount(state, kind) + queuedUnitCount(state, kind);
    const force = playerUnitsView(state).filter(e => UNIT_STATS[e.kind as UnitKind].damage > 0).length;
    const desired: UnitKind[] = [];
    if (count("harvester") < 2) desired.push("harvester");
    if (this.strategy === "behemoths") desired.push("behemoth", "antiArmor");
    if (this.strategy === "aircraft") desired.push("strikePlane", "tank", "antiArmor");
    if (this.strategy === "support") {
      if (count("medic") < Math.max(1, Math.ceil(count("infantry") / 4))) desired.push("medic");
      if (count("repairTruck") < Math.max(1, Math.ceil(count("tank") / 3))) desired.push("repairTruck");
      desired.push("tank", "antiArmor", "infantry");
    }
    const handled = new Set<string>();
    for (const kind of desired) {
      if (force >= 32 && UNIT_STATS[kind].damage > 0) continue;
      if (kind === "strikePlane" && count(kind) >= 3) continue;
      const producerKind = producerFor(kind);
      if (handled.has(producerKind)) continue;
      const producer = readyProducers(state, producerKind).find(p => producerKind !== "runway" || (p.assignedPlaneId === undefined && !p.producing && p.queue.length === 0));
      if (!producer) continue;
      const queueSize = producerKind === "barracks" || producerKind === "factory"
        ? sharedProductionQueueSize(readSharedProductionQueue(state, 0, producerKind))
        : (producer.producing ? 1 : 0) + producer.queue.length;
      if (queueSize >= 2 || bank < UNIT_STATS[kind].cost) continue;
      orders.push({ type: "produce", fromId: producer.id, unit: kind });
      bank -= UNIT_STATS[kind].cost;
      handled.add(producerKind);
    }
    return orders;
  }
}

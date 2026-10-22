import type { Command, Entity, MissionKind, SimState } from "../../types";
import { canRepair } from "../repair";
import { COMMANDER_CADENCE, playerBuildingsView, type CommanderMetrics } from "./queries";
import { planBuilding, planProduction } from "./production";
import { planFieldOrders } from "./fieldOrders";

const COMMANDER_REPAIR_CREDIT_RESERVE = 0;
const COMMANDER_YARD_REPAIR_THRESHOLD = 0.92;
const COMMANDER_STRUCTURE_REPAIR_THRESHOLD = 0.6;

function repairPriority(kind: Entity["kind"]): number {
  if (kind === "constructionYard") return 0;
  if (kind === "power") return 1;
  if (kind === "refinery") return 2;
  if (kind === "barracks") return 3;
  if (kind === "factory") return 4;
  return 5;
}

function planRepair(state: SimState): Command | undefined {
  if (state.credits[0] < COMMANDER_REPAIR_CREDIT_RESERVE) return undefined;
  // Repair one structure at a time. This keeps the credit drain predictable
  // and prevents the cadence from toggling an already-active repair order.
  if (playerBuildingsView(state).some((building) => building.repairing)) return undefined;

  const target = playerBuildingsView(state)
    .filter((building) => canRepair(building))
    .filter((building) => building.hp / building.maxHp <= (
      building.kind === "constructionYard"
        ? COMMANDER_YARD_REPAIR_THRESHOLD
        : COMMANDER_STRUCTURE_REPAIR_THRESHOLD
    ))
    .sort((a, b) => repairPriority(a.kind) - repairPriority(b.kind) || a.id - b.id)[0];
  return target ? { type: "repair", buildingId: target.id } : undefined;
}

export class CompetentCommander {
  private lastCombatOrder = "";
  private lastCombatOrderTick = Number.NEGATIVE_INFINITY;
  private assaultKind?: MissionKind;
  private assaultTargetId?: number;
  private metrics: CommanderMetrics = { plans: 0, commands: 0, commandsByType: {} };

  plan(state: SimState): Command[] {
    if (state.result !== "playing" || state.tutorialStage !== undefined || state.tick % COMMANDER_CADENCE !== 0) return [];
    const yard = playerBuildingsView(state, "constructionYard")[0];
    if (!yard) return [];

    this.metrics.plans += 1;
    const commands: Command[] = [];
    const repair = planRepair(state);
    if (repair) {
      commands.push(repair);
    } else {
      const building = planBuilding(state, yard);
      if (building) commands.push(building);
      if (!building) commands.push(...planProduction(state));
    }
    const fieldMemory = {
      assaultKind: this.assaultKind,
      assaultTargetId: this.assaultTargetId,
      lastCombatOrder: this.lastCombatOrder,
      lastCombatOrderTick: this.lastCombatOrderTick,
    };
    planFieldOrders(state, yard, fieldMemory, commands);
    this.assaultKind = fieldMemory.assaultKind;
    this.assaultTargetId = fieldMemory.assaultTargetId;
    this.lastCombatOrder = fieldMemory.lastCombatOrder;
    this.lastCombatOrderTick = fieldMemory.lastCombatOrderTick;
    this.metrics.commands += commands.length;
    for (const command of commands) {
      this.metrics.commandsByType[command.type] = (this.metrics.commandsByType[command.type] ?? 0) + 1;
    }
    return commands;
  }

  getMetrics(): CommanderMetrics {
    return {
      plans: this.metrics.plans,
      commands: this.metrics.commands,
      commandsByType: { ...this.metrics.commandsByType },
    };
  }
}

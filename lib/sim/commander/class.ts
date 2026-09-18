import { inObjectiveZone } from "../../types";
import type { Command, Entity, MissionKind, SimState } from "../../types";
import { canRepair } from "../repair";
import { distToEntity } from "../world";
import {
  COMMANDER_CADENCE,
  COMBAT_ORDER_REFRESH,
  OFFENSIVE_KINDS,
  combatUnits,
  objectiveKind,
  playerBuildingsView,
  isCombatEntity,
  enemyEntitiesView,
} from "./queries";
import {
  planBuilding,
  planProduction,
} from "./production";
import {
  objectiveEntity,
  parallelOffensiveTargets,
  defensiveThreat,
  scenarioThreat,
  assaultReady,
  offensiveApproachTarget,
  orderKey,
  yardRaid,
} from "./combat";
import { isTimedRecovery, scenarioHomeGuardSize } from "../policy";
import type { CommanderMetrics } from "./queries";

const COMMANDER_REPAIR_CREDIT_RESERVE = 0;
const COMMANDER_YARD_REPAIR_THRESHOLD = 0.92;
const COMMANDER_STRUCTURE_REPAIR_THRESHOLD = 0.6;
const COMMANDER_FINAL_PUSH_RATIO = 0.72;

function finalPushActive(state: SimState): boolean {
  const director = state.runtime?.director;
  if (director && (director.phase === "finale" || state.tick >= director.finaleStart)) return true;
  const deadline = state.runtime?.deadline ?? state.win.ticks;
  return deadline !== undefined && state.tick >= deadline * COMMANDER_FINAL_PUSH_RATIO;
}

const DECAPITATE_FIRE_RANGE = 4;

function pushAssault(commands: Command[], state: SimState, target: Entity, unitIds: number[], kind: MissionKind): void {
  if (kind !== "decapitate") {
    commands.push({ type: "attackMove", unitIds, x: target.x, y: target.y, formation: "wedge" });
    return;
  }
  const close: number[] = [];
  const far: number[] = [];
  for (const id of unitIds) {
    const unit = state.entities.find((entity) => entity.id === id);
    if (!unit) continue;
    if (distToEntity(unit, target) <= DECAPITATE_FIRE_RANGE) close.push(id);
    else far.push(id);
  }
  if (far.length) commands.push({ type: "attackMove", unitIds: far, x: target.x, y: target.y, formation: "wedge" });
  if (close.length) commands.push({ type: "attack", unitIds: close, targetId: target.id });
}

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

    const emergency = yard.hp / Math.max(1, yard.maxHp) < 0.78;
    const emergencyThreat = emergency
      ? enemyEntitiesView(state)
        .filter(isCombatEntity)
        .sort((a, b) => distToEntity(a, yard) - distToEntity(b, yard) || a.id - b.id)[0]
      : undefined;
    const threat = defensiveThreat(state, yard) ?? scenarioThreat(state) ?? emergencyThreat;
    const objective = objectiveEntity(state);
    const approachObjective = objective && objective.owner === 1 ? offensiveApproachTarget(state, objective) : objective;
    const extractionCargo = objectiveKind(state) === "extraction"
      ? (state.runtime?.targetIds ?? []).map((id) => state.entities.find((entity) => entity.id === id && entity.hp > 0)).filter((entity): entity is Entity => !!entity && !entity.neutral && !inObjectiveZone(entity.x, entity.y, state.runtime?.zone))
      : [];
    const rescueReturnUnits = objectiveKind(state) === "rescue"
      ? (state.runtime?.targetIds ?? []).map((id) => state.entities.find((entity) => entity.id === id && entity.hp > 0)).filter((entity): entity is Entity => !!entity && !entity.neutral && !inObjectiveZone(entity.x, entity.y, state.runtime?.zone))
      : [];
    const extractionCargoIds = new Set(extractionCargo.map((entity) => entity.id));
    const rescueReturnIds = new Set(rescueReturnUnits.map((entity) => entity.id));
    const extractionEscortTarget = [...extractionCargo]
      .sort((a, b) => distToEntity(b, yard) - distToEntity(a, yard) || a.id - b.id)[0];
    const rescueEscortTarget = [...rescueReturnUnits]
      .sort((a, b) => distToEntity(b, yard) - distToEntity(a, yard) || a.id - b.id)[0];
    const combat = combatUnits(state);
    const objectiveCombat = isTimedRecovery(objectiveKind(state))
      ? combat.filter((entity) => !extractionCargoIds.has(entity.id) && !rescueReturnIds.has(entity.id))
      : combat;
    const finalPush = finalPushActive(state);
    const scenarioObjective = ["escort", "rescue", "extraction"].includes(objectiveKind(state)) && (
      objective?.neutral === true || extractionCargo.length > 0 || rescueReturnUnits.length > 0
    ) && (objectiveKind(state) !== "escort" || state.runtime?.convoyStartTick === undefined);

    const returningScenarioUnits = [...extractionCargo, ...rescueReturnUnits];
    if (returningScenarioUnits.length) {
      commands.push({ type: "move", unitIds: returningScenarioUnits.map((entity) => entity.id), x: yard.x, y: yard.y, formation: "line" });
    }

    if (combat.length) {
      const combatCommands: Command[] = [];
      const offensiveObjective = objective && objective.owner === 1 && OFFENSIVE_KINDS.has(objectiveKind(state));
      const strikeTarget = objectiveKind(state) === "decapitate" ? objective : approachObjective;
      const assaultTargets = offensiveObjective
        ? objectiveKind(state) !== "sabotage" && parallelOffensiveTargets(state).length > 1
          ? parallelOffensiveTargets(state)
          : strikeTarget ? [strikeTarget] : []
        : [];
      if (!offensiveObjective || this.assaultKind !== objectiveKind(state)) {
        this.assaultKind = offensiveObjective ? objectiveKind(state) : undefined;
        this.assaultTargetId = undefined;
      }
      if (offensiveObjective && objective && (this.assaultTargetId === undefined || this.assaultTargetId !== objective.id)) {
        // A late objective is a closeout, not another staging cycle. Commit
        // the force that exists so a partially depleted army can still finish
        // a marked target before the deadline.
        if (this.assaultTargetId !== undefined || finalPush || assaultReady(state, objective, combat)) {
          this.assaultTargetId = objective.id;
        }
      }
      const assaultCommitted = offensiveObjective && this.assaultTargetId !== undefined;
      const defenderLimit = Math.min(4, Math.max(2, Math.floor(combat.length / 3)));
      const scenarioDefenderLimit = scenarioHomeGuardSize(objectiveKind(state), objectiveCombat.length);
      const reservedDefenders = scenarioObjective
        ? Math.min(scenarioDefenderLimit, Math.max(0, objectiveCombat.length - 1))
        : offensiveObjective
          ? Math.min(
            finalPush ? (threat ? 1 : 0) : state.missionIndex < 2 ? 0 : 2,
            Math.max(0, objectiveCombat.length - 1),
          )
          : defenderLimit;
      const defenders = (threat || offensiveObjective || scenarioObjective)
        ? [...objectiveCombat]
          .sort((a, b) => distToEntity(a, yard) - distToEntity(b, yard) || a.id - b.id)
          .slice(0, reservedDefenders)
        : [];
      const defenderIds = new Set(defenders.map((entity) => entity.id));
      const assaultForce = offensiveObjective || scenarioObjective
        ? objectiveCombat.filter((entity) => !defenderIds.has(entity.id))
        : combat;

      if (emergency && emergencyThreat) {
        combatCommands.push({ type: "attack", unitIds: combat.map((entity) => entity.id), targetId: emergencyThreat.id });
      } else if (offensiveObjective && objective) {
        if (threat) {
          const keepAssaultUnderThreat = assaultCommitted && defenders.length > 0 && assaultForce.length > 0 && (
            finalPush || (objectiveKind(state) === "decapitate" && !yardRaid(state, yard))
          );
          if (keepAssaultUnderThreat) {
            // Keep the home guard on a scout or finale raid; a committed
            // decapitation assault should not walk home for one infantry.
            combatCommands.push({ type: "attack", unitIds: defenders.map((entity) => entity.id), targetId: threat.id });
            for (let index = 0; index < assaultTargets.length; index++) {
              const target = assaultTargets[index]!;
              const unitIds = assaultForce.filter((_, unitIndex) => unitIndex % assaultTargets.length === index).map((entity) => entity.id);
              if (unitIds.length) {
                pushAssault(combatCommands, state, target, unitIds, objectiveKind(state));
              }
            }
          } else {
            combatCommands.push({ type: "attack", unitIds: combat.map((entity) => entity.id), targetId: threat.id });
          }
        } else if (assaultCommitted && assaultForce.length) {
          if (defenders.length) {
            combatCommands.push({ type: "move", unitIds: defenders.map((entity) => entity.id), x: yard.x, y: yard.y, formation: "line" });
          }
          for (let index = 0; index < assaultTargets.length; index++) {
            const target = assaultTargets[index]!;
            const unitIds = assaultForce.filter((_, unitIndex) => unitIndex % assaultTargets.length === index).map((entity) => entity.id);
            if (unitIds.length) {
              pushAssault(combatCommands, state, target, unitIds, objectiveKind(state));
            }
          }
        } else {
          combatCommands.push({ type: "move", unitIds: combat.map((entity) => entity.id), x: yard.x, y: yard.y, formation: "line" });
        }
      } else if (threat) {
        if (["escort", "rescue", "extraction"].includes(objectiveKind(state)) && objectiveCombat.length) {
          if (defenders.length) {
            combatCommands.push({ type: "attack", unitIds: defenders.map((entity) => entity.id), targetId: threat.id });
          }
          const responseForce = assaultForce;
          const pendingNeutral = objective?.neutral === true;
          const escortTarget = objectiveKind(state) === "extraction"
            ? extractionEscortTarget ?? objective
            : objective;
          if (responseForce.length && pendingNeutral && objective && objectiveKind(state) !== "escort") {
            // Yard raids are the home guard's job. Pulling the contact team
            // home every time a scout reaches the HQ is what blows rescue and
            // extraction deadlines.
            combatCommands.push({
              type: objectiveKind(state) === "extraction" ? "attackMove" : "move",
              unitIds: responseForce.map((entity) => entity.id),
              x: objective.x,
              y: objective.y,
              formation: "line",
            });
          } else if (responseForce.length && escortTarget) {
            // A threatened scenario target takes priority over escort travel.
            // The force will receive its route to the target again once the
            // threat clears, while direct attack keeps the response force
            // from walking past the attacker.
            combatCommands.push({ type: "attack", unitIds: responseForce.map((entity) => entity.id), targetId: threat.id });
          }
        } else {
          // Keep the rescue guard assigned to local defense instead of sending it with the rescue force.
          const rescueDefense = objectiveKind(state) === "rescue" && scenarioObjective;
          if (rescueDefense && defenders.length) {
            combatCommands.push({ type: "attack", unitIds: defenders.map((entity) => entity.id), targetId: threat.id });
          }
          const responseForce = rescueDefense ? assaultForce : combat;
          if (responseForce.length) {
            combatCommands.push({ type: "attack", unitIds: responseForce.map((entity) => entity.id), targetId: threat.id });
          }
        }
      } else {
        const force = scenarioObjective ? assaultForce : combat;
        const extractionRecovery = objectiveKind(state) === "extraction" && extractionCargo.length > 0 && objective?.neutral !== true;
        const rescueRecovery = objectiveKind(state) === "rescue" && rescueReturnUnits.length > 0;
        const recoveryTarget = objectiveKind(state) === "extraction"
          ? extractionEscortTarget
          : rescueEscortTarget;
        const rescueContactTarget = objectiveKind(state) === "rescue" && objective?.neutral ? objective : undefined;
        if (scenarioObjective && defenders.length) {
          combatCommands.push({ type: "move", unitIds: defenders.map((entity) => entity.id), x: yard.x, y: yard.y, formation: "line" });
        }
        if (force.length && (extractionRecovery || rescueRecovery)) {
          // Contact the next stranded unit while already-contacted units
          // return on their own orders. This lets a rescue operation make
          // independent progress instead of serializing every target behind
          // the slowest return trip.
          const nextScenarioTarget = rescueContactTarget ?? recoveryTarget;
          const needsScenarioEscort = nextScenarioTarget !== undefined && force.some((entity) => distToEntity(entity, nextScenarioTarget) > 6);
          const recoveryDestination = needsScenarioEscort ? nextScenarioTarget : yard;
          combatCommands.push({ type: "attackMove", unitIds: force.map((entity) => entity.id), x: recoveryDestination.x, y: recoveryDestination.y, formation: "line" });
        } else if (force.length && objective && (objective.neutral || objective.class === "unit" && objective.owner === 0)) {
          const escortDestination = { x: objective.x, y: objective.y };
          if (objectiveKind(state) === "escort") {
            combatCommands.push({ type: "attackMove", unitIds: force.map((entity) => entity.id), x: escortDestination.x, y: escortDestination.y, formation: "wedge" });
          } else {
            combatCommands.push({ type: "move", unitIds: force.map((entity) => entity.id), x: objective.x, y: objective.y, formation: "line" });
          }
        } else if (force.length && ["harvestQuota", "forceQuota", "structureQuota", "holdTheLine"].includes(objectiveKind(state))) {
          combatCommands.push({ type: "move", unitIds: force.map((entity) => entity.id), x: yard.x, y: yard.y, formation: "line" });
        }
      }

      if (combatCommands.length) {
        const key = combatCommands
          .map((command) => `${orderKey(command)}:${"unitIds" in command ? command.unitIds.join(",") : ""}`)
          .join("|");
        if (key !== this.lastCombatOrder || state.tick - this.lastCombatOrderTick >= COMBAT_ORDER_REFRESH) {
          commands.push(...combatCommands);
          this.lastCombatOrder = key;
          this.lastCombatOrderTick = state.tick;
        }
      }
    }

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

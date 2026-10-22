import { isAirUnit, UNIT_STATS } from "../../catalog";
import { inObjectiveZone, isUnitEntity, type Command, type Entity, type MissionKind, type SimState } from "../../types";
import { distToEntity } from "../world";
import { entitiesFor } from "../entities";
import {
  COMBAT_ORDER_REFRESH,
  OFFENSIVE_KINDS,
  YARD_THREAT_RADIUS,
  combatUnits,
  enemyEntitiesView,
  isCombatEntity,
  objectiveKind,
} from "./queries";
import {
  assaultReady,
  defensiveThreat,
  objectiveEntity,
  offensiveApproachTarget,
  orderKey,
  parallelOffensiveTargets,
  scenarioThreat,
  yardRaid,
} from "./combat";
import { isTimedRecovery, scenarioHomeGuardSize } from "../policy";
import { directFireRangeBonusAt } from "../terrainRules";
import { heightRangeBonus } from "../combat/targeting";

const COMMANDER_FINAL_PUSH_RATIO = 0.72;
const DECAP_ASSAULT_RECOVERY_RATIO = 0.4;
const SCENARIO_CONTACT_FORCE_LIMIT = 8;

function scenarioContactForce(units: Entity[], target: Entity | undefined): Entity[] {
  if (!target || units.length <= SCENARIO_CONTACT_FORCE_LIMIT) return units;
  return units
    .slice()
    .sort((a, b) => distToEntity(a, target) - distToEntity(b, target) || a.id - b.id)
    .slice(0, SCENARIO_CONTACT_FORCE_LIMIT);
}

function finalPushActive(state: SimState): boolean {
  const director = state.runtime?.director;
  if (director && (director.phase === "finale" || state.tick >= director.finaleStart)) return true;
  const deadline = state.runtime?.deadline ?? state.win.ticks;
  return deadline !== undefined && state.tick >= deadline * COMMANDER_FINAL_PUSH_RATIO;
}

const DECAPITATE_FIRE_RANGE = 4;

function pushAssault(commands: Command[], state: SimState, target: Entity, unitIds: number[], kind: MissionKind): void {
  const focusStructure = kind === "annihilate" && target.class === "building";
  if (kind !== "decapitate" && !focusStructure) {
    commands.push({ type: "attackMove", unitIds, x: target.x, y: target.y, formation: "wedge" });
    return;
  }
  const close: number[] = [];
  const far: number[] = [];
  for (const id of unitIds) {
    const unit = entitiesFor(state).find((entity) => entity.id === id);
    if (!unit || !isUnitEntity(unit)) continue;
    // Once a siege unit can fire, focus the structure rather than repeatedly
    // walking through its footprint and giving its repair crew breathing room.
    const range = focusStructure
      ? UNIT_STATS[unit.kind].range + (isAirUnit(unit.kind) ? 0 : directFireRangeBonusAt(state, unit)) + heightRangeBonus(state, unit, target)
      : DECAPITATE_FIRE_RANGE;
    if (distToEntity(unit, target) <= range) close.push(id);
    else far.push(id);
  }
  if (far.length) commands.push({ type: "attackMove", unitIds: far, x: target.x, y: target.y, formation: "wedge" });
  if (close.length) commands.push({ type: "attack", unitIds: close, targetId: target.id });
}

export type FieldMemory = {
  assaultKind?: MissionKind;
  assaultTargetId?: number;
  lastCombatOrder: string;
  lastCombatOrderTick: number;
};

export function planFieldOrders(state: SimState, yard: Entity, memory: FieldMemory, commands: Command[]): void {
  const emergency = yard.hp / Math.max(1, yard.maxHp) < 0.78;
  const emergencyThreat = emergency
    ? enemyEntitiesView(state)
      .filter((entity) => isCombatEntity(entity) && !(entity.class === "unit" && isAirUnit(entity.kind)))
      .sort((a, b) => distToEntity(a, yard) - distToEntity(b, yard) || a.id - b.id)[0]
    : undefined;
  const yardThreat = defensiveThreat(state, yard);
  const threat = yardThreat ?? scenarioThreat(state) ?? emergencyThreat;
  const objective = objectiveEntity(state);
  const approachObjective = objective && objective.owner === 1 ? offensiveApproachTarget(state, objective) : objective;
  const extractionCargo = objectiveKind(state) === "extraction"
    ? (state.runtime?.targetIds ?? []).map((id) => entitiesFor(state).find((entity) => entity.id === id && entity.hp > 0)).filter((entity): entity is Entity => !!entity && !entity.neutral && !inObjectiveZone(entity.x, entity.y, state.runtime?.zone))
    : [];
  const rescueReturnUnits = objectiveKind(state) === "rescue"
    ? (state.runtime?.targetIds ?? []).map((id) => entitiesFor(state).find((entity) => entity.id === id && entity.hp > 0)).filter((entity): entity is Entity => !!entity && !entity.neutral && !inObjectiveZone(entity.x, entity.y, state.runtime?.zone))
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
  const unitsNeedingReturnOrder = returningScenarioUnits.filter((entity) => {
    const destination = entity.orderDestination;
    return entity.orderMode !== "move" || !destination || Math.hypot(destination.x - yard.x, destination.y - yard.y) > 8;
  });
  if (unitsNeedingReturnOrder.length) {
    // A contacted unit already has a return route from the scenario system.
    // Reissuing a formation order every commander cadence resets that route
    // and can strand the unit in a congested corridor indefinitely.
    commands.push({ type: "move", unitIds: unitsNeedingReturnOrder.map((entity) => entity.id), x: yard.x, y: yard.y, formation: "line" });
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
    if (!offensiveObjective || memory.assaultKind !== objectiveKind(state)) {
      memory.assaultKind = offensiveObjective ? objectiveKind(state) : undefined;
      memory.assaultTargetId = undefined;
    }
    if (offensiveObjective && objective && (memory.assaultTargetId === undefined || memory.assaultTargetId !== objective.id)) {
      // A late objective is a closeout, not another staging cycle. Commit
      // the force that exists so a partially depleted army can still finish
      // a marked target before the deadline.
      if (memory.assaultTargetId !== undefined || finalPush || assaultReady(state, objective, combat)) {
        memory.assaultTargetId = objective.id;
      }
    }
    const assaultCommitted = offensiveObjective && memory.assaultTargetId !== undefined;
    const defenderLimit = Math.min(4, Math.max(2, Math.floor(combat.length / 3)));
    const scenarioDefenderLimit = scenarioHomeGuardSize(objectiveKind(state), objectiveCombat.length);
    const reservedDefenders = scenarioObjective
      ? Math.min(scenarioDefenderLimit, Math.max(0, objectiveCombat.length - 1))
      : offensiveObjective
        ? Math.min(
          finalPush ? (threat ? 1 : 0) : (objectiveKind(state) === "annihilate" || state.missionIndex < 2 ? 0 : 2),
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
    const recoveringAssault = offensiveObjective && objectiveKind(state) === "decapitate" && !finalPush
      ? assaultForce.filter((entity) => entity.hp / Math.max(1, entity.maxHp) < DECAP_ASSAULT_RECOVERY_RATIO)
      : [];
    const readyAssaultForce = recoveringAssault.length
      ? assaultForce.filter((entity) => !recoveringAssault.includes(entity))
      : assaultForce;
    if (recoveringAssault.length) {
      combatCommands.push({
        type: "move",
        unitIds: recoveringAssault.map((entity) => entity.id),
        x: yard.x,
        y: yard.y,
        formation: "line",
      });
    }

    if (emergency && emergencyThreat) {
      combatCommands.push({ type: "attack", unitIds: combat.map((entity) => entity.id), targetId: emergencyThreat.id });
    } else if (offensiveObjective && objective) {
      if (threat) {
        const keepAssaultUnderThreat = assaultCommitted && defenders.length > 0 && readyAssaultForce.length > 0 && (
          finalPush || (objectiveKind(state) === "decapitate" && !yardRaid(state, yard))
        );
        if (keepAssaultUnderThreat) {
          // Keep the home guard on a scout or finale raid; a committed
          // decapitation assault should not walk home for one infantry.
          combatCommands.push({ type: "attack", unitIds: defenders.map((entity) => entity.id), targetId: threat.id });
          for (let index = 0; index < assaultTargets.length; index++) {
            const target = assaultTargets[index]!;
            const unitIds = readyAssaultForce.filter((_, unitIndex) => unitIndex % assaultTargets.length === index).map((entity) => entity.id);
            if (unitIds.length) {
              pushAssault(combatCommands, state, target, unitIds, objectiveKind(state));
            }
          }
        } else {
          combatCommands.push({ type: "attack", unitIds: combat.map((entity) => entity.id), targetId: threat.id });
        }
      } else if (assaultCommitted && readyAssaultForce.length) {
        if (defenders.length) {
          combatCommands.push({ type: "move", unitIds: defenders.map((entity) => entity.id), x: yard.x, y: yard.y, formation: "line" });
        }
        for (let index = 0; index < assaultTargets.length; index++) {
          const target = assaultTargets[index]!;
          const unitIds = readyAssaultForce.filter((_, unitIndex) => unitIndex % assaultTargets.length === index).map((entity) => entity.id);
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
        const returningUnit = extractionEscortTarget ?? rescueEscortTarget;
        if (responseForce.length && pendingNeutral && objective && objectiveKind(state) !== "escort") {
          // Yard raids are the home guard's job. Keep the contact team on
          // the objective; pulling it home for every nearby attacker is
          // what causes rescue and extraction deadlines to expire.
          const contactForce = scenarioContactForce(responseForce, objective);
          combatCommands.push({
            type: objectiveKind(state) === "extraction" ? "attackMove" : "move",
            unitIds: contactForce.map((entity) => entity.id),
            x: objective.x,
            y: objective.y,
            formation: "line",
          });
        } else if (responseForce.length && returningUnit) {
          // Cargo already at the base must not count as the scenario
          // threat. Stay with the unit that is still in the field.
          const localThreat = enemyEntitiesView(state)
            .filter((entity) => isCombatEntity(entity) && !(entity.class === "unit" && isAirUnit(entity.kind)))
            .sort((a, b) => distToEntity(returningUnit, a) - distToEntity(returningUnit, b) || a.id - b.id)
            .find((entity) => distToEntity(returningUnit, entity) <= YARD_THREAT_RADIUS);
          if (localThreat) {
            combatCommands.push({ type: "attack", unitIds: responseForce.map((entity) => entity.id), targetId: localThreat.id });
          } else {
            combatCommands.push({ type: "attackMove", unitIds: responseForce.map((entity) => entity.id), x: returningUnit.x, y: returningUnit.y, formation: "line" });
          }
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
        const holdDefense = objectiveKind(state) === "holdTheLine";
        if (rescueDefense && defenders.length) {
          combatCommands.push({ type: "attack", unitIds: defenders.map((entity) => entity.id), targetId: threat.id });
        }
        if (holdDefense && defenders.length) {
          combatCommands.push({ type: "attack", unitIds: defenders.map((entity) => entity.id), targetId: threat.id });
          const reserve = combat.filter((entity) => !defenderIds.has(entity.id));
          if (reserve.length) {
            combatCommands.push({ type: "move", unitIds: reserve.map((entity) => entity.id), x: yard.x, y: yard.y, formation: "line" });
          }
        } else {
          const responseForce = rescueDefense ? assaultForce : combat;
          if (responseForce.length) {
            combatCommands.push({ type: "attack", unitIds: responseForce.map((entity) => entity.id), targetId: threat.id });
          }
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
        const remainingNeutralTargets = state.runtime?.targetIds.filter((id) => entitiesFor(state).some((entity) => entity.id === id && entity.hp > 0 && entity.neutral)).length ?? 0;
        const contactForce = objectiveKind(state) === "extraction" && (state.runtime?.targetIds.length ?? 0) > 2 && remainingNeutralTargets <= 1
          ? force
          : scenarioContactForce(force, nextScenarioTarget);
        const needsScenarioEscort = nextScenarioTarget !== undefined && contactForce.some((entity) => distToEntity(entity, nextScenarioTarget) > 6);
        const recoveryDestination = needsScenarioEscort ? nextScenarioTarget : yard;
        combatCommands.push({ type: "attackMove", unitIds: contactForce.map((entity) => entity.id), x: recoveryDestination.x, y: recoveryDestination.y, formation: "line" });
      } else if (force.length && objective && (objective.neutral || objective.class === "unit" && objective.owner === 0)) {
        const escortDestination = { x: objective.x, y: objective.y };
        if (objectiveKind(state) === "escort") {
          // Before the convoy starts, a small contact team prevents the
          // staging tile from becoming a traffic jam. Once it moves, keep
          // the full force available to screen it from attackers.
          const escortForce = state.runtime?.convoyStartTick === undefined
            ? scenarioContactForce(force, objective)
            : force;
          combatCommands.push({ type: "attackMove", unitIds: escortForce.map((entity) => entity.id), x: escortDestination.x, y: escortDestination.y, formation: "wedge" });
        } else {
          const remainingNeutralTargets = state.runtime?.targetIds.filter((id) => entitiesFor(state).some((entity) => entity.id === id && entity.hp > 0 && entity.neutral)).length ?? 0;
          const contactForce = objectiveKind(state) === "extraction" && (state.runtime?.targetIds.length ?? 0) > 2 && remainingNeutralTargets <= 1
            ? force
            : scenarioContactForce(force, objective);
          combatCommands.push({ type: "move", unitIds: contactForce.map((entity) => entity.id), x: objective.x, y: objective.y, formation: "line" });
        }
      } else if (force.length && ["harvestQuota", "forceQuota", "structureQuota", "holdTheLine"].includes(objectiveKind(state))) {
        combatCommands.push({ type: "move", unitIds: force.map((entity) => entity.id), x: yard.x, y: yard.y, formation: "line" });
      }
    }

    if (combatCommands.length) {
      const key = combatCommands
        .map((command) => `${orderKey(command)}:${"unitIds" in command ? command.unitIds.join(",") : ""}`)
        .join("|");
      if (key !== memory.lastCombatOrder || state.tick - memory.lastCombatOrderTick >= COMBAT_ORDER_REFRESH) {
        commands.push(...combatCommands);
        memory.lastCombatOrder = key;
        memory.lastCombatOrderTick = state.tick;
      }
    }
  }
}

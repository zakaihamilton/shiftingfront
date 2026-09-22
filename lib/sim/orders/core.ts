import { isAirUnit, isSupportEntity } from "../../catalog";
import { TILE_RESOURCE, type Command, type Entity, type SimEvent, type SimState, type TutorialStage } from "../../types";
import { enterTutorialStage, tutorialCommandCompletesStage, tutorialTargets, type TutorialWorldTarget } from "../tutorialStage";
import { findPathDetailed, routePendingFor } from "../pathfinding";
import { FOREGROUND_PATH_MAX_NODES, FOREGROUND_PATHS_PER_ORDER } from "../pathBudget";
import { byId, inBounds, tileAt } from "../world";
import { holdSupport } from "../support";
import { landAircraft } from "../aircraft";
import { moveUnits, attackMoveUnits } from "./movement";
import { attackUnits, supportUnits, setStance, setFormation } from "./combat";
import { startBuild, cancelBuild, sellBuilding, setRallyPoint, toggleRepair } from "./building";
import { startProduce, cancelProduce } from "./production";
import { entitiesFor, withEntityWorldBatch } from "../ecs/world";

export function issue(state: SimState, command: Command): SimEvent[] {
  return withEntityWorldBatch(state, () => issueInReadBatch(state, command));
}

function issueInReadBatch(state: SimState, command: Command): SimEvent[] {
  if (state.result !== "playing") return [];
  const tutorialExpectedTargets = state.tutorialStage ? tutorialTargets(state) : undefined;
  let events: SimEvent[];
  switch (command.type) {
    case "move":
      events = moveUnits(state, command.unitIds, command.x, command.y, command.formation);
      break;
    case "attackMove":
      events = attackMoveUnits(state, command.unitIds, command.x, command.y, command.formation);
      break;
    case "attack":
      events = attackUnits(state, command.unitIds, command.targetId);
      break;
    case "support":
      events = supportUnits(state, command.unitIds, command.targetId);
      break;
    case "land":
      events = landAircraft(state, command.unitIds, command.runwayId);
      break;
    case "harvest":
      events = harvestUnits(state, command.unitIds, command.x, command.y);
      break;
    case "build":
      events = startBuild(state, command.building, command.x, command.y);
      break;
    case "produce":
      events = startProduce(state, command.fromId, command.unit);
      break;
    case "rally":
      events = setRallyPoint(state, command.buildingId, command.x, command.y);
      break;
    case "cancelBuild":
      events = cancelBuild(state, command.building);
      break;
    case "cancelProduce":
      events = cancelProduce(state, command.unit);
      break;
    case "repair":
      events = toggleRepair(state, command.buildingId);
      break;
    case "sell":
      events = sellBuilding(state, command.buildingId);
      break;
    case "stop":
      events = stopUnits(state, command.unitIds);
      break;
    case "stance":
      events = setStance(state, command.unitIds, command.stance);
      break;
    case "formation":
      events = setFormation(state, command.unitIds, command.formation);
      break;
    default:
      events = [];
  }
  if (!events.some((event) => event.type === "commandRejected")) {
    advanceTutorialAfterCommand(state, command, tutorialExpectedTargets);
  }
  return events;
}

function advanceTutorialAfterCommand(state: SimState, command: Command, expectedTargets?: TutorialWorldTarget[]): void {
  if (!state.tutorialStage || state.tutorialStage === "complete") return;
  const next: Partial<Record<TutorialStage, TutorialStage>> = {
    move: "build",
    build: "produce",
    produce: "attack",
    attack: "repair",
    repair: "complete",
  };
  const stage = state.tutorialStage;
  // Attack is an action trigger, but the lesson is not complete until the
  // passive drill unit has actually been destroyed by the combat system.
  if (stage === "attack") return;
  // Construction is complete only after the production system finishes the
  // Power Plant. Keep the coach on this lesson while it is being built.
  if (stage === "build") {
    if (tutorialCommandCompletesStage(state, command, expectedTargets) && command.type === "build") {
      const building = entitiesFor(state).find((entity) =>
        entity.owner === 0 &&
        entity.class === "building" &&
        entity.kind === "power" &&
        entity.constructing > 0 &&
        Math.round(entity.x) === Math.round(command.x) &&
        Math.round(entity.y) === Math.round(command.y),
      );
      if (building) state.tutorialBuildId = building.id;
    }
    return;
  }
  const nextStage = next[stage];
  if (nextStage && tutorialCommandCompletesStage(state, command, expectedTargets)) enterTutorialStage(state, nextStage);
}

function stopUnits(state: SimState, ids: number[]): SimEvent[] {
  for (const id of ids) {
    const e = byId(state, id);
    if (!e || e.owner !== 0 || e.class !== "unit") continue;
    e.path = [];
    e.attackTarget = undefined;
    e.orderMode = undefined;
    e.orderDestination = undefined;
    e.flowGoal = undefined;
    e.gatherX = undefined;
    e.gatherY = undefined;
    e.routePending = false;
    e.idle = true;
    e.moveToHarvest = undefined;
    if (isAirUnit(e.kind)) e.landingRunwayId = undefined;
    if (isSupportEntity(e)) holdSupport(e);
  }
  return [];
}

function travelOrder(ids: number[], x: number, y: number, attackMove: boolean): Command {
  return attackMove
    ? { type: "attackMove", unitIds: ids, x, y }
    : { type: "move", unitIds: ids, x, y };
}

function findNearbyResourceTile(state: SimState, x: number, y: number, maxRadius = 2): { x: number; y: number } | undefined {
  if (inBounds(state, x, y) && tileAt(state, x, y) === TILE_RESOURCE && (state.resourceAmount[y * state.width + x] ?? 0) > 0) {
    return { x, y };
  }
  let best: { x: number; y: number } | undefined;
  let bestDist = Infinity;
  for (let dy = -maxRadius; dy <= maxRadius; dy++) {
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(state, nx, ny)) continue;
      const i = ny * state.width + nx;
      if (tileAt(state, nx, ny) === TILE_RESOURCE && (state.resourceAmount[i] ?? 0) > 0) {
        const d = Math.hypot(dx, dy);
        if (d < bestDist) {
          bestDist = d;
          best = { x: nx, y: ny };
        }
      }
    }
  }
  return best;
}

export function patchResourceTiles(state: SimState, cx: number, cy: number, radius = 4): { x: number; y: number }[] {
  const tiles: { x: number; y: number; d: number }[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(state, nx, ny)) continue;
      const i = ny * state.width + nx;
      if (tileAt(state, nx, ny) === TILE_RESOURCE && (state.resourceAmount[i] ?? 0) > 0) {
        tiles.push({ x: nx, y: ny, d: Math.hypot(dx, dy) });
      }
    }
  }
  tiles.sort((a, b) => a.d - b.d);
  return tiles.map((t) => ({ x: t.x, y: t.y }));
}

/** Right-click / tap ground: harvest ore with harvesters, move everyone else onto the tile. */
export function groundOrders(state: SimState, ids: number[], x: number, y: number, attackMove = false): Command[] {
  const tx = Math.round(x);
  const ty = Math.round(y);
  if (!inBounds(state, tx, ty)) {
    return [travelOrder(ids, tx, ty, attackMove)];
  }
  const harvesters: number[] = [];
  const movers: number[] = [];
  for (const id of ids) {
    const e = byId(state, id);
    if (!e || e.class !== "unit" || e.owner !== 0 || e.neutral) continue;
    if (e.kind === "harvester") harvesters.push(id);
    else movers.push(id);
  }
  const targetResource = harvesters.length > 0 ? findNearbyResourceTile(state, tx, ty, 2) : undefined;
  if (!targetResource) {
    if (!attackMove || harvesters.length === 0) return [travelOrder(ids, tx, ty, attackMove)];
    const commands: Command[] = [];
    if (harvesters.length) commands.push({ type: "move", unitIds: harvesters, x: tx, y: ty });
    if (movers.length) commands.push({ type: "attackMove", unitIds: movers, x: tx, y: ty });
    return commands;
  }
  const commands: Command[] = [];
  if (harvesters.length) commands.push({ type: "harvest", unitIds: harvesters, x: targetResource.x, y: targetResource.y });
  if (movers.length) commands.push(travelOrder(movers, tx, ty, attackMove));
  return commands;
}

function harvestUnits(state: SimState, ids: number[], x: number, y: number): SimEvent[] {
  const hx = Math.round(x);
  const hy = Math.round(y);
  const patch = patchResourceTiles(state, hx, hy, 4);
  const resourceSlots = patch.length > 0 ? patch : [{ x: hx, y: hy }];

  const validUnits = ids
    .map((id) => byId(state, id))
    .filter((e): e is Entity => Boolean(e && e.kind === "harvester" && e.owner === 0 && !e.neutral));

  let searches = 0;
  validUnits.forEach((e, index) => {
    const slot = resourceSlots[index % resourceSlots.length]!;
    e.attackTarget = undefined;
    e.flowGoal = undefined;
    e.orderMode = "move";
    e.orderDestination = { x: slot.x, y: slot.y };
    e.gatherX = slot.x;
    e.gatherY = slot.y;
    e.idle = false;
    e.moveToHarvest = undefined;
    if (searches < FOREGROUND_PATHS_PER_ORDER) {
      const result = findPathDetailed(state, e, { x: e.gatherX, y: e.gatherY }, { maxNodes: FOREGROUND_PATH_MAX_NODES });
      e.path = result.path;
      e.routePending = routePendingFor(result.status);
      searches += 1;
    } else {
      e.path = [];
      e.routePending = true;
    }
  });
  return [];
}

export function applyCommands(state: SimState, commands: Command[]): SimEvent[] {
  const events: SimEvent[] = [];
  for (const c of commands) events.push(...issue(state, c));
  return events;
}

export function setPathTo(state: SimState, e: Entity, dest: { x: number; y: number }): void {
  e.flowGoal = undefined;
  const result = findPathDetailed(state, e, dest);
  e.path = result.path;
  e.routePending = routePendingFor(result.status);
}

import { canSupportTarget, isSupportEntity, isSupportUnit, UNIT_STATS } from "../catalog";
import { isUnitEntity, type Entity, type SimEvent, type SimState } from "../types";
import { tryFindPathDetailed } from "./pathBudget";
import { routePendingFor } from "./pathfinding";
import { byId, distToEntity, livingView } from "./world";
import { travelOrderInProgress } from "./navigation/avoidance";

export function canSupportEntity(provider: Entity, target: Entity): boolean {
  if (!isUnitEntity(provider) || !isUnitEntity(target)) return false;
  if (provider.id === target.id || provider.owner !== target.owner) return false;
  if (provider.neutral || target.neutral || target.hp <= 0) return false;
  return canSupportTarget(provider.kind, target.kind);
}

export function nearestSupportTarget(state: SimState, provider: Entity): Entity | undefined {
  let best: Entity | undefined;
  let bestDistance = Infinity;
  for (const target of livingView(state)) {
    if (!canSupportEntity(provider, target) || target.hp >= target.maxHp) continue;
    const distance = distToEntity(provider, target);
    if (distance < bestDistance || (distance === bestDistance && target.id < (best?.id ?? Infinity))) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}

export function assignSupportTarget(state: SimState, provider: Entity, target: Entity): void {
  if (!canSupportEntity(provider, target)) return;
  provider.supportTargetId = target.id;
  provider.supportMode = "assigned";
  provider.attackTarget = undefined;
  provider.flowGoal = undefined;
  provider.orderMode = "move";
  provider.orderDestination = { x: target.x, y: target.y };
  provider.gatherX = undefined;
  provider.gatherY = undefined;
  provider.idle = false;
  const result = tryFindPathDetailed(state, provider, target);
  if (result) {
    provider.path = result.path;
    provider.routePending = routePendingFor(result.status);
  } else {
    provider.path = [];
    provider.routePending = true;
  }
}

function clearSupportRoute(provider: Entity): void {
  provider.supportTargetId = undefined;
  provider.flowGoal = undefined;
  provider.routePending = false;
  provider.path = [];
  provider.orderMode = undefined;
  provider.orderDestination = undefined;
  provider.idle = true;
}

const EMPTY_EVENTS: SimEvent[] = [];

export function tickSupport(state: SimState, eventSink?: SimEvent[], collectEvents = true): SimEvent[] {
  const events = eventSink ?? (collectEvents ? [] : undefined);
  for (const provider of livingView(state)) {
    if (!isUnitEntity(provider) || !isSupportUnit(provider.kind) || provider.neutral) continue;
    const stats = UNIT_STATS[provider.kind];
    const supportRange = stats.supportRange ?? 0;
    const supportAmount = stats.supportAmount ?? 0;
    const supportInterval = stats.supportInterval ?? 0;
    const mode = provider.supportMode ?? "auto";
    provider.supportMode = mode;
    if (provider.cooldown > 0) provider.cooldown -= 1;
    provider.attackTarget = undefined;

    if (mode === "hold") continue;
    if (mode === "auto" && provider.supportTargetId === undefined &&
        (provider.orderMode === "move" || provider.orderMode === "attackMove") && travelOrderInProgress(provider)) continue;

    let target = provider.supportTargetId === undefined ? undefined : byId(state, provider.supportTargetId);
    if (target && !canSupportEntity(provider, target)) target = undefined;
    if (mode === "auto" && target && target.hp >= target.maxHp) target = undefined;
    if (!target && mode === "assigned") {
      provider.supportMode = "auto";
    }
    if (!target && provider.supportMode === "auto") target = nearestSupportTarget(state, provider);

    if (!target) {
      const hadSupportTarget = provider.supportTargetId !== undefined;
      provider.supportTargetId = undefined;
      if (hadSupportTarget && provider.supportMode === "auto") clearSupportRoute(provider);
      else if (!provider.path.length && !provider.orderDestination) provider.idle = true;
      continue;
    }
    if (!isUnitEntity(target)) continue;

    const destinationChanged =
      !provider.orderDestination ||
      Math.hypot(provider.orderDestination.x - target.x, provider.orderDestination.y - target.y) > 1;
    provider.supportTargetId = target.id;
    provider.flowGoal = undefined;
    provider.orderMode = "move";
    provider.orderDestination = { x: target.x, y: target.y };
    provider.gatherX = undefined;
    provider.gatherY = undefined;
    provider.idle = false;

    if (distToEntity(provider, target) > supportRange) {
      if (!provider.path.length || destinationChanged) {
        if (provider.routePending === false && !destinationChanged) continue;
        const result = tryFindPathDetailed(state, provider, target);
        if (result) {
          provider.path = result.path;
          provider.routePending = routePendingFor(result.status);
          provider.idle = result.status === "unreachable";
        }
      }
      continue;
    }

    provider.path = [];
    provider.routePending = false;
    if (provider.cooldown > 0 || target.hp >= target.maxHp || supportAmount <= 0) continue;
    const healed = Math.min(supportAmount, target.maxHp - target.hp);
    if (healed <= 0) continue;
    target.hp += healed;
    provider.cooldown = supportInterval;
    events?.push({
      type: "support",
      owner: provider.owner,
      providerId: provider.id,
      providerKind: provider.kind,
      targetId: target.id,
      targetKind: target.kind,
      amount: healed,
      x: provider.x,
      y: provider.y,
      targetX: target.x,
      targetY: target.y,
    });
  }
  return events ?? EMPTY_EVENTS;
}

export function holdSupport(provider: Entity): void {
  if (!isSupportEntity(provider)) return;
  provider.supportTargetId = undefined;
  provider.supportMode = "hold";
  clearSupportRoute(provider);
}

export function clearSupportOrder(provider: Entity): void {
  if (!isSupportEntity(provider)) return;
  provider.supportTargetId = undefined;
  provider.supportMode = "auto";
}

import { repairCostFor, repairHpPerTick } from "../catalog";
import { isBuildingEntity, type SimEvent, type SimState } from "../types";
import { isCombatThreat } from "./combat/grid";
import { entitiesFor } from "./entities";

export function canRepair(e: { class: string; hp: number; maxHp: number; constructing: number }): boolean {
  return e.class === "building" && e.hp > 0 && e.constructing === 0 && e.hp < e.maxHp;
}

const EMPTY_EVENTS: SimEvent[] = [];

function isUnderAttack(state: SimState, buildingId: number, owner: number): boolean {
  return entitiesFor(state).some(
    (attacker) => attacker.hp > 0
      && attacker.owner !== owner
      && attacker.attackTarget === buildingId
      && isCombatThreat(state, attacker),
  );
}

export function tickRepair(state: SimState, eventSink?: SimEvent[], collectEvents = true): SimEvent[] {
  const events = eventSink ?? (collectEvents ? [] : undefined);
  for (const e of entitiesFor(state)) {
    if (!e.repairing) continue;
    if (!isBuildingEntity(e) || e.hp <= 0 || e.constructing > 0) {
      e.repairing = false;
      continue;
    }
    if (e.hp >= e.maxHp) {
      e.hp = e.maxHp;
      e.repairing = false;
      continue;
    }
    if (isUnderAttack(state, e.id, e.owner)) continue;
    const kind = e.kind;
    const restored = Math.min(repairHpPerTick(kind), e.maxHp - e.hp);
    const cost = Math.max(1, Math.round(repairCostFor(kind, restored)));
    if (state.credits[e.owner] < cost) continue;
    state.credits[e.owner] -= cost;
    e.hp = Math.min(e.maxHp, e.hp + restored);
    events?.push({
      type: "repair",
      owner: e.owner,
      buildingId: e.id,
      kind,
      amount: restored,
      cost,
      x: e.x,
      y: e.y,
    });
    if (e.hp >= e.maxHp) {
      e.hp = e.maxHp;
      e.repairing = false;
    }
  }
  return eventSink ? EMPTY_EVENTS : events ?? EMPTY_EVENTS;
}

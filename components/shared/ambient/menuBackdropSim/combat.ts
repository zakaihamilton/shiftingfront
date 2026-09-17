import { nearest } from "@/lib/sim/world";
import { assignAttack } from "@/lib/sim/ai/combat";
import { assignSupportTarget } from "@/lib/sim/support";
import { isSupportUnit, UNIT_STATS } from "@/lib/catalog";
import type { UnitKind } from "@/lib/types";
import type { createMission } from "@/lib/sim/api";

export function assignClashTargets(
  state: ReturnType<typeof createMission>,
  clashX: number,
  clashY: number,
  radius = 8,
): void {
  const units = state.entities.filter((e) => e.class === "unit" && e.hp > 0);
  for (const u of units) {
    if (isSupportUnit(u.kind as UnitKind)) {
      if (u.supportTargetId === undefined || u.idle) {
        const target = nearest(
          state,
          u,
          (e) => e.owner === u.owner && e.hp > 0 && e.hp < e.maxHp && Math.hypot(e.x - clashX, e.y - clashY) <= radius,
        );
        if (target) assignSupportTarget(state, u, target);
      }
    } else if (UNIT_STATS[u.kind as UnitKind].damage > 0) {
      if (u.attackTarget === undefined || u.idle) {
        const target = nearest(
          state,
          u,
          (e) => e.owner !== u.owner && e.hp > 0 && Math.hypot(e.x - clashX, e.y - clashY) <= radius,
        );
        if (target) assignAttack(state, u, target);
      }
    }
  }
}

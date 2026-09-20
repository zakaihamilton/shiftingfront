import { finalizeMultiSelect, pickEntity } from "@/lib/render/pick";
import { pickTile, visibleBuildingAt } from "@/lib/render/renderer";
import { entityElev } from "@/lib/render/renderPicking";
import { BUILDING_DEFINITIONS, isAirUnit } from "@/lib/catalog";
import { TILE_H, screenToGroundTile, tileToScreen, type Camera } from "@/lib/iso";
import { groundOrders } from "@/lib/sim/orders";
import { canSupportEntity } from "@/lib/sim/support";
import { isBuildingEntity, isPlayerSelectableUnit, type Command, type Entity, type SimState } from "@/lib/types";
import type { MobileCommand } from "../mobileCommandTypes";
import { selectionBoxProjection, type SelectionBox } from "./selectionBox";

export function isContactTarget(s: SimState, entity: SimState["entities"][number]): boolean {
  return (
    entity.neutral === true &&
    (s.runtime?.kind === "escort" || s.runtime?.kind === "rescue" || s.runtime?.kind === "extraction") &&
    Boolean(s.runtime.targetIds?.includes(entity.id))
  );
}

export function entityAt(s: SimState, tx: number, ty: number) {
  const unit = s.entities.find(
    (en) =>
      en.hp > 0 &&
      isPlayerSelectableUnit(en) &&
      (isContactTarget(s, en) || !en.neutral) &&
      Math.round(en.x) === tx &&
      Math.round(en.y) === ty,
  );
  if (unit) return unit;
  return visibleBuildingAt(s, tx, ty);
}

export function pickSelectableEntity(s: SimState, x: number, y: number, tx: number, ty: number, cam: Camera) {
  return (
    pickEntity(s, x, y, cam, s.runtime?.kind === "escort" || s.runtime?.kind === "rescue" || s.runtime?.kind === "extraction") ??
    entityAt(s, tx, ty)
  );
}

export function friendlySupportOrders(s: SimState, ids: number[], target: SimState["entities"][number], x: number, y: number): Command[] {
  if (target.owner !== 0 || target.class !== "unit" || target.neutral) return [];
  const supportIds = ids.filter((id) => {
    const provider = s.entities.find((entity) => entity.id === id && entity.hp > 0);
    return provider ? canSupportEntity(provider, target) : false;
  });
  if (!supportIds.length) return [];
  const commands: Command[] = [{ type: "support", unitIds: supportIds, targetId: target.id }];
  const otherIds = ids.filter((id) => !supportIds.includes(id));
  if (otherIds.length) commands.push(...groundOrders(s, otherIds, x, y, true));
  return commands;
}

/** Returns a rally command for a selected producer, or undefined when the selection is not a producer. */
export function productionRallyOrder(
  s: SimState,
  ids: number[],
  target: SimState["entities"][number] | undefined,
  x: number,
  y: number,
): Command[] | undefined {
  if (ids.length !== 1) return undefined;
  const building = s.entities.find((entity) => entity.id === ids[0] && entity.hp > 0);
  if (!building || !isBuildingEntity(building) || building.owner !== 0 || building.constructing > 0 || !BUILDING_DEFINITIONS[building.kind].production) {
    return undefined;
  }
  return target ? [] : [{ type: "rally", buildingId: building.id, x, y }];
}

const ORDER_NOTICE_LABELS: { type: Command["type"]; label: string }[] = [
  { type: "rally", label: "rally point" },
  { type: "attack", label: "attack" },
  { type: "support", label: "support" },
  { type: "land", label: "land" },
  { type: "harvest", label: "harvest" },
  { type: "attackMove", label: "attack-move" },
  { type: "move", label: "move" },
];

function capitalizeNotice(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function contextOrderNotice(commands: Command[]): string {
  const labels = ORDER_NOTICE_LABELS
    .filter((entry) => commands.some((command) => command.type === entry.type))
    .map((entry) => entry.label);
  if (!labels.length) return "Order issued.";
  if (labels.length === 1 && labels[0] === "rally point") return "Rally point set.";
  if (labels.length === 1) return `${capitalizeNotice(labels[0]!)} order issued.`;
  const last = labels[labels.length - 1]!;
  const joined = labels.length === 2
    ? `${capitalizeNotice(labels[0]!)} and ${last}`
    : `${capitalizeNotice(labels.slice(0, -1).join(", "))}, and ${last}`;
  return `${joined} orders issued.`;
}

export function contextOrders(s: SimState, ids: number[], target: SimState["entities"][number] | undefined, x: number, y: number, attackMove = false): Command[] {
  const rallyOrders = productionRallyOrder(s, ids, target, x, y);
  if (rallyOrders !== undefined) return rallyOrders;
  const supportOrders = target ? friendlySupportOrders(s, ids, target, x, y) : [];
  if (supportOrders.length) return supportOrders;
  if (target?.owner === 0 && target.class === "building" && target.kind === "runway") {
    const aircraft = ids.filter((id) => {
      const entity = s.entities.find((candidate) => candidate.id === id && candidate.hp > 0);
      const runwayDeadOrMissing = entity?.assignedRunwayId === undefined || !s.entities.some((c) => c.id === entity.assignedRunwayId && c.hp > 0);
      return entity?.owner === 0 && entity.class === "unit" && isAirUnit(entity.kind) &&
        (entity.assignedRunwayId === target.id || (target.assignedPlaneId === undefined && runwayDeadOrMissing));
    });
    const others = ids.filter((id) => !aircraft.includes(id));
    const commands: Command[] = aircraft.length ? [{ type: "land", unitIds: aircraft, runwayId: target.id }] : [];
    if (others.length) commands.push(...groundOrders(s, others, x, y, attackMove));
    if (commands.length) return commands;
  }
  if (target && target.owner === 1) return [{ type: "attack", unitIds: ids, targetId: target.id }];
  return groundOrders(s, ids, x, y, attackMove || target === undefined);
}

export function mobileCommandOrders(
  s: SimState,
  command: MobileCommand,
  ids: number[],
  target: SimState["entities"][number] | undefined,
  x: number,
  y: number,
): Command[] {
  const rallyOrders = command === "move" ? productionRallyOrder(s, ids, target, x, y) : undefined;
  if (rallyOrders !== undefined) return rallyOrders;
  const supportOrders = target ? friendlySupportOrders(s, ids, target, x, y) : [];
  if (supportOrders.length) return supportOrders;
  if (target?.owner === 0 && target.class === "building" && target.kind === "runway") {
    const aircraft = ids.filter((id) => {
      const entity = s.entities.find((candidate) => candidate.id === id && candidate.hp > 0);
      const runwayDeadOrMissing = entity?.assignedRunwayId === undefined || !s.entities.some((c) => c.id === entity.assignedRunwayId && c.hp > 0);
      return entity?.owner === 0 && entity.class === "unit" && isAirUnit(entity.kind) &&
        (entity.assignedRunwayId === target.id || (target.assignedPlaneId === undefined && runwayDeadOrMissing));
    });
    if (aircraft.length) return [{ type: "land", unitIds: aircraft, runwayId: target.id }];
  }
  if (command === "move") return groundOrders(s, ids, x, y, true);
  if (command === "attackMove") return groundOrders(s, ids, x, y, true);
  if (command === "attack" && target?.owner === 1) return [{ type: "attack", unitIds: ids, targetId: target.id }];
  if (command === "harvest" && s.tiles[y * s.width + x] === 2) return [{ type: "harvest", unitIds: ids, x, y }];
  return [];
}

export function unitOnScreen(
  s: SimState,
  cam: Camera,
  viewport: { width: number; height: number },
  entity: Entity,
): boolean {
  const z = cam.zoom;
  const elev = entityElev(s, entity);
  const pos = tileToScreen(entity.x, entity.y, cam, elev);
  const bodyX = pos.x;
  const bodyY = pos.y + (TILE_H / 2) * z - 12 * z;
  return bodyX >= 0 && bodyX <= viewport.width && bodyY >= 0 && bodyY <= viewport.height;
}

/** All on-screen living units matching the clicked unit's kind, owner, and neutrality. */
export function selectVisibleUnitsOfKind(
  s: SimState,
  cam: Camera,
  viewport: { width: number; height: number },
  prototype: Entity,
): number[] {
  if (!isPlayerSelectableUnit(prototype) || prototype.hp <= 0) return [];
  const ids: number[] = [];
  for (const en of s.entities) {
    if (
      en.hp <= 0 ||
      !isPlayerSelectableUnit(en) ||
      en.kind !== prototype.kind ||
      en.owner !== prototype.owner ||
      Boolean(en.neutral) !== Boolean(prototype.neutral) ||
      (en.neutral && !isContactTarget(s, en))
    ) {
      continue;
    }
    if (en.id === prototype.id || unitOnScreen(s, cam, viewport, en)) ids.push(en.id);
  }
  return ids;
}

export function selectionIdsInBox(s: SimState, cam: Camera, box: SelectionBox, finalize: boolean) {
  const ids: number[] = [];
  const projectedBox = selectionBoxProjection(box, cam);
  const x0 = Math.min(projectedBox.x0, projectedBox.x1);
  const y0 = Math.min(projectedBox.y0, projectedBox.y1);
  const x1 = Math.max(projectedBox.x0, projectedBox.x1);
  const y1 = Math.max(projectedBox.y0, projectedBox.y1);
  for (const en of s.entities) {
    if (en.hp <= 0 || en.owner !== 0 || !isPlayerSelectableUnit(en) || (en.neutral && !isContactTarget(s, en))) continue;
    const elev = entityElev(s, en);
    const sp = tileToScreen(en.x, en.y, { x: 0, y: 0, zoom: cam.zoom }, elev);
    const projected = { x: sp.x / cam.zoom, y: sp.y / cam.zoom };
    if (projected.x >= x0 && projected.x <= x1 && projected.y >= y0 && projected.y <= y1) ids.push(en.id);
  }
  return finalize ? finalizeMultiSelect(s.entities, ids) : ids;
}

export function pointerTile(s: SimState, p: { x: number; y: number }, cam: Camera) {
  const picked = pickTile(s, p.x, p.y, cam);
  const t = picked ?? screenToGroundTile(p.x, p.y, cam);
  return { x: Math.round(t.x), y: Math.round(t.y) };
}

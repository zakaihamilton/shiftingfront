import { BUILDING_DEFINITIONS, TICKS_PER_SECOND, UNIT_STATS, labelFor, sellRefundFor } from "../../catalog";
import { inObjectiveZone, missionUsesObjectiveZone, SURFACE_CONCRETE, SURFACE_NONE, SURFACE_ROAD, TILE_BLOCKED, TILE_RESOURCE, TILE_WATER } from "../../types";
import { fogAt } from "../../sim/fog";
import { isMountainScenery } from "../../gen/map";
import { biomeLabel } from "../../gen/names";
import { terrainAccess } from "../../sim/world";
import { canSell } from "../../sim/sell";
import { isExtractableUnit, isLockedContactUnit } from "../renderCombat";
import { isBuildingEntity, type BuildingKind, type Entity, type SimState, type UnitKind } from "../../types";
import { SceneryMemo } from "../sceneryMemo";
import type { RenderExtras } from "./types";
import { chromeMonoFont } from "../../ui/chromeFont";

const sceneryMemo = new SceneryMemo();

export function clearTooltipRenderCache(): void {
  sceneryMemo.clear();
}

function memoScenery(state: SimState, x: number, y: number) {
  return sceneryMemo.sample(state, x, y);
}

export function tileTooltipLines(state: SimState, x: number, y: number): string[] {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return ["Map edge"];
  const fog = fogAt(state, x, y);
  if (fog === 0) return ["Unexplored"];
  const scenery = memoScenery(state, x, y);
  const surface = state.surfaces[y * state.width + x] ?? SURFACE_NONE;
  let terrain = "Open ground";
  if (scenery.kind === TILE_WATER) terrain = "Water";
  else if (scenery.kind === TILE_RESOURCE) terrain = "Ore field";
  else if (isMountainScenery(scenery)) terrain = "Ridge";
  else if (scenery.kind === TILE_BLOCKED) terrain = "Impassable";
  if (surface === SURFACE_ROAD) terrain = "Dirt road";
  else if (surface === SURFACE_CONCRETE) terrain = "Concrete pad";
  const access = terrainAccess(state, x, y);
  const lines = [terrain, biomeLabel(state.biome) || state.biome, `Height ${scenery.elev}`, access.traversable ? "Passable" : "Impassable"];
  if (scenery.kind === TILE_RESOURCE) lines.push(`Ore ${state.resourceAmount[y * state.width + x] ?? 0}`);
  if (!access.buildable) lines.push("Construction blocked");
  if (fog === 1) lines.push("Shrouded");
  if (missionUsesObjectiveZone(state.runtime?.kind) && inObjectiveZone(x, y, state.runtime?.zone)) {
    lines.push(
      state.runtime?.kind === "escort"
        ? "Convoy destination"
        : state.runtime?.kind === "rescue" ? "Command HQ zone" : "Extraction zone",
    );
  }
  return lines;
}

export function tooltipLines(state: SimState, e: Entity, extras: RenderExtras): string[] {
  const name = labelFor(e.kind as UnitKind | BuildingKind);
  const cls = e.class === "unit" ? "Unit" : "Building";
  const faction = state.factions[e.owner]?.name ?? (e.owner === 0 ? "Player" : "Enemy");
  const lines = [
    `${name} · ${cls}`,
    `${e.owner === 0 ? "Friendly" : "Hostile"} · ${faction}`,
    `Health ${Math.max(0, Math.round(e.hp))} / ${e.maxHp}`,
  ];
  if ((e.suppression ?? 0) > 0) lines.push(`Suppressed ${Math.ceil(e.suppression ?? 0)}%`);
  if (e.scenarioRole === "convoy") lines.push("Convoy · protect the route");
  else if (e.scenarioRole === "stranded" || isLockedContactUnit(state, e)) lines.push("Stranded");
  else if (e.scenarioRole === "cargo" && e.neutral) lines.push("Asset awaiting rescue");
  if (isExtractableUnit(state, e) && !e.neutral) {
    lines.push("Return to extraction zone");
  }
  if (e.kind === "harvester") {
    lines.push(`Cargo ${e.carry} / ${UNIT_STATS.harvester.carryMax}`);
  }
  if (e.constructing > 0) {
    lines.push(`Under construction (${Math.ceil(e.constructing / TICKS_PER_SECOND)}s)`);
  }
  if (e.producing) {
    lines.push(`Training ${labelFor(e.producing.kind)} (${Math.ceil(e.producing.remaining / TICKS_PER_SECOND)}s)`);
    const queued = e.queue?.length ?? 0;
    if (queued > 0) lines.push(`In queue: ${queued}`);
  }
  if (isBuildingEntity(e) && e.owner === 0 && e.constructing <= 0 && BUILDING_DEFINITIONS[e.kind].production) {
    lines.push(e.rallyPoint ? `Rally point ${e.rallyPoint.x}, ${e.rallyPoint.y}` : "Rally point not set");
  }
  if (e.repairing) lines.push("Repairing");
  if (e.marked && e.class === "building") lines.push("Marked objective");
  if (extras.sellMode && e.owner === 0 && canSell(e)) {
    lines.push(`Sell for ${sellRefundFor(e.kind as BuildingKind, e.hp)} credits`);
  }
  return lines;
}

export function drawTooltip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lines: string[],
  canvasW: number,
  canvasH: number,
  anchorAbove = false,
): void {
  const pad = 8;
  ctx.font = chromeMonoFont(12);
  let textW = 0;
  for (const l of lines) textW = Math.max(textW, ctx.measureText(l).width);
  const width = Math.min(260, textW + pad * 2);
  const lineH = 16;
  const height = lines.length * lineH + pad * 2 - 2;

  let tx: number;
  let ty: number;

  if (anchorAbove) {
    tx = Math.round(x - width / 2);
    ty = Math.round(y - height - 8);
    if (ty < 8) {
      ty = Math.round(y + 36);
    }
  } else {
    tx = x + 18;
    ty = y + 18;
    if (tx + width > canvasW - 10) tx = x - width - 14;
    if (ty + height > canvasH - 10) ty = y - height - 14;
  }

  if (tx + width > canvasW - 10) tx = canvasW - width - 10;
  if (tx < 8) tx = 8;
  if (ty + height > canvasH - 10) ty = canvasH - height - 10;
  if (ty < 8) ty = 8;

  ctx.fillStyle = "rgba(16, 21, 16, 0.94)";
  ctx.strokeStyle = "#b0a263";
  ctx.lineWidth = 1;
  ctx.fillRect(tx, ty, width, height);
  ctx.strokeRect(tx, ty, width, height);
  ctx.fillStyle = "#d8cfaa";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = i === 0 ? "#e1d59f" : "#aeb49a";
    ctx.fillText(lines[i]!, tx + pad, ty + pad + 11 + i * lineH);
  }
}

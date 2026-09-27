import { labelFor } from "../../catalog";
import type { Entity, SimEvent, SimState } from "../../types";

export type AlertCategory = "yard" | "convoy" | "harvester" | "building" | "unit";

export type PendingAlerts = Record<AlertCategory, boolean>;

const ALERT_MUTE_TICKS = 72;

type AlertMute = Record<`${AlertCategory}Until`, number>;

function emptyPending(): PendingAlerts {
  return { yard: false, convoy: false, harvester: false, building: false, unit: false };
}

function emptyMute(): AlertMute {
  return {
    yardUntil: Number.NEGATIVE_INFINITY,
    convoyUntil: Number.NEGATIVE_INFINITY,
    harvesterUntil: Number.NEGATIVE_INFINITY,
    buildingUntil: Number.NEGATIVE_INFINITY,
    unitUntil: Number.NEGATIVE_INFINITY,
  };
}

export function notePlayerAlert(state: SimState, attacker: Entity, target: Entity, pending: PendingAlerts): void {
  const player = state.viewOwner ?? 0;
  if (target.owner !== player || attacker.owner === player) return;
  if (target.kind === "constructionYard") pending.yard = true;
  else if (target.scenarioRole === "convoy") pending.convoy = true;
  else if (target.kind === "harvester") pending.harvester = true;
  else if (target.class === "building") pending.building = true;
  else pending.unit = true;
}

function selectedCategory(pending: PendingAlerts): AlertCategory | undefined {
  if (pending.yard) return "yard";
  if (pending.convoy) return "convoy";
  if (pending.harvester) return "harvester";
  if (pending.building) return "building";
  if (pending.unit) return "unit";
  return undefined;
}

export function flushPlayerAlerts(state: SimState, pending: PendingAlerts, events?: SimEvent[]): void {
  const category = selectedCategory(pending);
  if (!category) return;
  const mute = alertMute.get(state) ?? emptyMute();
  const until = mute[`${category}Until`];
  if (state.tick < until) return;
  mute[`${category}Until`] = state.tick + ALERT_MUTE_TICKS;
  alertMute.set(state, mute);
  events?.push(alertEvent(category));
}

function alertEvent(category: AlertCategory): SimEvent {
  if (category === "yard") return { type: "alert", kind: "warning", text: `${labelFor("constructionYard")} under attack` };
  if (category === "convoy") return { type: "alert", kind: "contact", text: "Convoy under attack" };
  if (category === "harvester") return { type: "alert", kind: "contact", text: "Harvester under attack" };
  if (category === "building") return { type: "alert", kind: "contact", text: "Base under attack" };
  return { type: "alert", kind: "contact", text: "Unit under attack" };
}

export function createPendingAlerts(): PendingAlerts {
  return emptyPending();
}

const alertMute = new WeakMap<SimState, AlertMute>();

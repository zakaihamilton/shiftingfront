import { labelFor } from "@/lib/catalog";
import type { Formation, SimState, Stance } from "@/lib/types";
import { FORMATION_OPTIONS, STANCE_OPTIONS } from "./orders";

export { lossReasonLabel } from "../sim/debrief";

const REJECTION_MESSAGES: Record<string, string> = {
  "unit unavailable": "This unit isn't available yet.",
  "producer unavailable": "You need the required building first.",
  "wrong producer": "Train this unit from the correct building.",
  "production queue full": "The production queue is full.",
  "insufficient credits": "Not enough credits.",
  "power shortage": "Restore power first.",
  "invalid building": "That structure can't be built.",
  "building limit reached": "Only one of that structure is allowed on this mission.",
  "invalid placement": "That ground can't be built on.",
  "construction yard unavailable": `You need a ${labelFor("constructionYard")}.`,
  "rally unavailable": "Select a completed Barracks or Vehicle Plant.",
  "invalid rally target": "That rally point is not passable.",
  "invalid attack target": "That's not a valid attack target.",
  "invalid support target": "That unit can't be healed or repaired.",
  "no eligible support unit": "Select a Field Medic or Repair Truck first.",
  "target out of range": "The target is out of range.",
};

const TRAINING_STEP_MESSAGES: Record<string, string> = {
  move: "Finish the movement training step first.",
  harvest: "Finish the harvesting training step first.",
  build: "Finish the construction training step first.",
  produce: "Finish the production training step first.",
  attack: "Finish the combat training step first.",
  repair: "Finish the repair training step first.",
};

export function commandRejectionMessage(reason: string): string {
  const mapped = REJECTION_MESSAGES[reason];
  if (mapped) return mapped;
  const training = /^training step: (.+)$/.exec(reason);
  if (training) return TRAINING_STEP_MESSAGES[training[1]!] ?? "Finish the current training step first.";
  return "That order couldn't be completed.";
}

export function saveResultLabel(result: SimState["result"]): string {
  if (result === "won") return "Complete";
  if (result === "lost") return "Failed";
  return "In progress";
}

export function stanceLabel(id: Stance): string {
  return STANCE_OPTIONS.find((option) => option.id === id)?.label ?? id;
}

export function formationLabel(id: Formation): string {
  return FORMATION_OPTIONS.find((option) => option.id === id)?.label ?? id;
}

export const SUPPORT_MODE_LABEL = {
  auto: "Automatic",
  assigned: "Assigned",
  hold: "Holding",
} as const;

export type BeepKind = "select" | "ack" | "ackAttack" | "ackHarvest" | "build" | "cancel" | "alert" | "win" | "lose";

export type SfxKind =
  | "uiSelect"
  | "uiConfirm"
  | "uiCancel"
  | "uiError"
  | "buildStart"
  | "buildComplete"
  | "productionComplete"
  | "repair"
  | "heal"
  | "sell"
  | "smallArms"
  | "antiArmor"
  | "cannon"
  | "airStrike"
  | "antiAir"
  | "impact"
  | "impactFlesh"
  | "impactMetal"
  | "destruction"
  | "wreckHuman"
  | "wreckVehicle"
  | "warning"
  | "objective"
  | "contact"
  | "victory"
  | "defeat"
  | "orderAttack"
  | "orderHarvest"
  | "credits"
  | "powerShortage"
  | "insufficientFunds"
  | "deadline";

export type SfxOptions = {
  pan?: number;
  gain?: number;
  minInterval?: number;
  force?: boolean;
  heavy?: boolean;
  delay?: number;
};

export const MAX_SFX_QUEUE_S = 0.28;

export const DEFAULT_INTERVALS: Partial<Record<SfxKind, number>> = {
  smallArms: 0.045,
  antiArmor: 0.1,
  cannon: 0.12,
  airStrike: 0.18,
  antiAir: 0.08,
  impact: 0.04,
  impactFlesh: 0.04,
  impactMetal: 0.04,
  destruction: 0.24,
  wreckHuman: 0.18,
  wreckVehicle: 0.2,
  contact: 0.22,
  credits: 0.12,
  heal: 0.16,
  repair: 0.16,
  powerShortage: 0.8,
  insufficientFunds: 0.18,
};

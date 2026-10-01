import type { GameplayRulesVersion } from "./types";

export const LEGACY_GAMEPLAY_RULES = 1 as const;
export const CURRENT_GAMEPLAY_RULES = 2 as const;

/** Omitted versions belong to campaigns created before rules were versioned. */
export function gameplayRulesVersion(value: GameplayRulesVersion | undefined): GameplayRulesVersion {
  if (value !== undefined && value !== 1 && value !== 2) throw new Error("Unsupported gameplay rules version");
  return value ?? LEGACY_GAMEPLAY_RULES;
}

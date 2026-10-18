import type { GameplayRulesVersion } from "./types";

export const LEGACY_GAMEPLAY_RULES = 1 as const;
export const CURRENT_GAMEPLAY_RULES = 2 as const;

/**
 * Omitted arguments use the current campaign rules. Save decoding still treats a
 * missing battlefield version as rules 1 so those operations can be retired.
 */
export function gameplayRulesVersion(value: GameplayRulesVersion | undefined): GameplayRulesVersion {
  if (value !== undefined && value !== 1 && value !== 2) throw new Error("Unsupported gameplay rules version");
  return value ?? CURRENT_GAMEPLAY_RULES;
}

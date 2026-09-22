import { describe, expect, it } from "vitest";
import { createCampaign } from "../../lib/gen/campaign";
import { generateMap } from "../../lib/gen/map";
import { missionFamilyFor, missionProfileFor, objectiveContractFor, profileContractFor, resolveMissionProfile } from "../../lib/gen/profile";
import { createMission } from "../../lib/sim/api";
import { scenarioAffordances } from "../../lib/sim/scenarios";
import { NEW_MISSION_KINDS } from "../../lib/catalog";
import type { MissionKind, MissionProfileVariant } from "../../lib/types";

const FAMILY_CASES: Array<[MissionKind, string]> = [
  ["harvestQuota", "economy"],
  ["forceQuota", "economy"],
  ["structureQuota", "economy"],
  ["destroyMarked", "assault"],
  ["razeAll", "assault"],
  ["decapitate", "assault"],
  ["annihilate", "assault"],
  ["holdTheLine", "defense"],
  ["escort", "operation"],
  ["sabotage", "operation"],
  ["rescue", "operation"],
  ["extraction", "operation"],
];

describe("mission profiles", () => {
  it("maps every mission kind to its intended family", () => {
    for (const [kind, family] of FAMILY_CASES) expect(missionFamilyFor(kind)).toBe(family);
  });

  it("is deterministic and varies profile variants across seeds", () => {
    for (const [kind] of FAMILY_CASES) {
      const first = missionProfileFor(421, 2, kind);
      expect(missionProfileFor(421, 2, kind)).toEqual(first);
      const variants = new Set(Array.from({ length: 64 }, (_, seed) => missionProfileFor(seed, 2, kind).variant));
      expect(variants.size).toBe(2);
    }
  });

  it("varies player and enemy spawn positions and topologies across campaigns", () => {
    const topologies = new Set<string>();
    const playerQuadrants = new Set<string>();
    const enemyQuadrants = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const campaign = createCampaign(seed);
      const mission = campaign.missions[0]!;
      const map = generateMap(seed, mission);
      if (map.spawnTopology) topologies.add(map.spawnTopology);
      playerQuadrants.add(`${map.playerStart.x > map.width / 2 ? "right" : "left"}-${map.playerStart.y > map.height / 2 ? "bottom" : "top"}`);
      enemyQuadrants.add(`${map.enemyStart.x > map.width / 2 ? "right" : "left"}-${map.enemyStart.y > map.height / 2 ? "bottom" : "top"}`);
    }
    expect(topologies.size).toBeGreaterThanOrEqual(8);
    expect(playerQuadrants).toEqual(new Set(["left-top", "right-bottom", "left-bottom", "right-top"]));
    expect(enemyQuadrants).toEqual(new Set(["left-top", "right-bottom", "left-bottom", "right-top"]));
  });

  it("resolves legacy missions without profile data identically", () => {
    const campaign = createCampaign(421);
    for (const mission of campaign.missions) {
      const legacy = { ...mission };
      delete legacy.profile;
      expect(resolveMissionProfile(421, mission.index, mission.win.kind, legacy.profile))
        .toEqual(missionProfileFor(421, mission.index, mission.win.kind));
    }
  });

  it("defines a complete, readable contract for every profile variant", () => {
    const variants: MissionProfileVariant[] = [
      "resourceRace", "forwardIndustry", "surgicalStrike", "siege",
      "concentratedWaves", "crossfire", "directRoute", "contestedRoute",
    ];
    for (const variant of variants) {
      const family = variant === "resourceRace" || variant === "forwardIndustry" ? "economy"
        : variant === "surgicalStrike" || variant === "siege" ? "assault"
          : variant === "concentratedWaves" || variant === "crossfire" ? "defense" : "operation";
      const contract = profileContractFor({ family, variant });
      expect(contract.label).not.toBe("");
      expect(contract.emphasis).not.toBe("");
      expect(contract.openingOrder).not.toBe("");
      expect(contract.fallback).not.toBe("");
      expect(contract.routeHint).not.toBe("");
      expect(contract.reinforcements.length).toBeGreaterThan(0);
      expect(contract.reinforcementLimit).toBeGreaterThan(0);
      expect(contract.maxRecoveryDelay).toBe(180);
      expect(contract.finaleRatio).toBeGreaterThan(0.6);
      expect(contract.finaleRatio).toBeLessThan(0.9);
    }
  });

  it("defines distinct objective contracts for offensive missions", () => {
    expect(objectiveContractFor("destroyMarked")).toMatchObject({
      targetLabel: "the marked targets",
      repairPolicy: "nonTarget",
      assaultDelay: 240,
      productionScale: 1,
    });
    expect(objectiveContractFor("sabotage")).toMatchObject({
      targetLabel: "the remaining systems",
      repairPolicy: "nonTarget",
      assaultDelay: 720,
      productionScale: 1.3,
    });
    expect(objectiveContractFor("decapitate")).toMatchObject({
      targetLabel: "the enemy Command HQ",
      repairPolicy: "none",
      assaultDelay: 840,
      productionScale: 1.45,
      startingSupport: false,
    });
    expect(objectiveContractFor("razeAll")).toMatchObject({ assaultDelay: 960, productionScale: 1.7, startingSupport: true });
    expect(objectiveContractFor("annihilate")).toMatchObject({ assaultDelay: 600, productionScale: 1.4, startingSupport: true });
    expect(objectiveContractFor("harvestQuota")).toBeUndefined();
  });

  it("exposes stable profiles and family-specific briefing hooks", () => {
    for (const seed of [0, 42, 421, 9999]) {
      const campaign = createCampaign(seed);
      expect(campaign.missions).toHaveLength(6);
      expect(campaign.missions.every((mission) => mission.profile)).toBe(true);
      const kinds = campaign.missions.map((mission) => mission.win.kind);
      const specialKinds = kinds.filter((kind) => NEW_MISSION_KINDS.includes(kind));
      expect(specialKinds).toHaveLength(3);
      expect(kinds.filter((kind) => !NEW_MISSION_KINDS.includes(kind))).toHaveLength(3);

      const briefingLines = campaign.missions.flatMap((mission) => mission.briefing.map((line) => line.text));
      expect(new Set(briefingLines).size).toBe(briefingLines.length);
      for (const mission of campaign.missions) {
        const variant = mission.profile!.variant;
        const text = mission.briefing.map((line) => line.text).join(" ");
        const hook = variant === "resourceRace" ? /ore|harvest/i
          : variant === "forwardIndustry" ? /industry|refinery|power/i
            : variant === "surgicalStrike" ? /breach|precision/i
              : variant === "siege" ? /siege|layered|approach/i
                : variant === "concentratedWaves" ? /one line|concentrating/i
                  : variant === "crossfire" ? /two approach|split|flank/i
                    : variant === "directRoute" ? /shortest route|direct route/i
                      : /exposed|flanks|screen/i;
        expect(text).toMatch(hook);
      }
    }
  });

  it("covers every generated profile variant", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 32; seed++) {
      const campaign = createCampaign(seed);
      for (const mission of campaign.missions) {
        seen.add(mission.profile!.variant);
      }
    }
    expect(seen).toEqual(new Set([
      "resourceRace", "forwardIndustry", "surgicalStrike", "siege",
      "concentratedWaves", "crossfire", "directRoute", "contestedRoute",
    ]));
  });

  it("measures a reachable multi-tile marked target from its perimeter", () => {
    const scenario = scenarioAffordances(createMission({ seed: 39, missionIndex: 2 }));

    expect(scenario.targetReachable).toBe(true);
    expect(scenario.routeLength).toBeGreaterThan(0);
  });
});

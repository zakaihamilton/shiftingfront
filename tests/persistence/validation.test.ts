import { describe, expect, it } from "vitest";
import {
  isEntity,
  isFiniteNumber,
  isWin,
  isNormalizableStateInput,
  isStateShape,
  isCampaignProgressShape,
  assertSupportedContentVersion,
  SAVE_CONTENT_VERSION,
} from "../../lib/persist/save/validation";
import { createMission } from "../../lib/sim/api";

describe("isFiniteNumber", () => {
  it("accepts finite numbers", () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(-42)).toBe(true);
    expect(isFiniteNumber(3.14)).toBe(true);
  });

  it("rejects non-numbers and specials", () => {
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber(Infinity)).toBe(false);
    expect(isFiniteNumber("0")).toBe(false);
    expect(isFiniteNumber(null)).toBe(false);
    expect(isFiniteNumber(undefined)).toBe(false);
  });
});

describe("isEntity", () => {
  const validUnit = {
    class: "unit", kind: "infantry", id: 1, owner: 0,
    x: 5, y: 5, hp: 100, maxHp: 100, cooldown: 0,
    path: [], carry: 0, constructing: 0, queue: [],
    marked: false, idle: false,
  };

  const validBuilding = {
    class: "building", kind: "power", id: 2, owner: 0,
    x: 3, y: 3, hp: 500, maxHp: 500, cooldown: 0,
    path: [], carry: 0, constructing: 0, queue: [],
    marked: false, idle: false,
  };

  it("accepts valid unit and building entities", () => {
    expect(isEntity(validUnit)).toBe(true);
    expect(isEntity({ ...validUnit, kind: "convoyTruck" })).toBe(true);
    expect(isEntity(validBuilding)).toBe(true);
  });

  it("rejects non-record values", () => {
    expect(isEntity(null)).toBe(false);
    expect(isEntity(42)).toBe(false);
    expect(isEntity("string")).toBe(false);
  });

  it("rejects unknown class", () => {
    expect(isEntity({ ...validUnit, class: "vehicle" })).toBe(false);
  });

  it("rejects invalid unit kind", () => {
    expect(isEntity({ ...validUnit, kind: "spaceship" })).toBe(false);
  });

  it("rejects invalid building kind", () => {
    expect(isEntity({ ...validBuilding, kind: "castle" })).toBe(false);
  });

  it("rejects invalid id", () => {
    expect(isEntity({ ...validUnit, id: -1 })).toBe(false);
    expect(isEntity({ ...validUnit, id: "abc" })).toBe(false);
  });

  it("rejects invalid owner", () => {
    expect(isEntity({ ...validUnit, owner: 2 })).toBe(false);
  });

  it("rejects non-finite coordinates", () => {
    expect(isEntity({ ...validUnit, x: NaN })).toBe(false);
    expect(isEntity({ ...validUnit, y: Infinity })).toBe(false);
  });

  it("rejects non-finite hp or maxHp", () => {
    expect(isEntity({ ...validUnit, hp: NaN })).toBe(false);
    expect(isEntity({ ...validUnit, maxHp: Infinity })).toBe(false);
  });

  it("rejects impossible health ranges", () => {
    expect(isEntity({ ...validUnit, hp: -1 })).toBe(false);
    expect(isEntity({ ...validUnit, hp: 101 })).toBe(false);
    expect(isEntity({ ...validUnit, maxHp: 0 })).toBe(false);
  });

  it("rejects negative cooldown", () => {
    expect(isEntity({ ...validUnit, cooldown: -1 })).toBe(false);
  });

  it("rejects non-array path", () => {
    expect(isEntity({ ...validUnit, path: "wrong" })).toBe(false);
  });

  it("rejects non-vec2 path elements", () => {
    expect(isEntity({ ...validUnit, path: [{ x: 1 }] })).toBe(false);
  });

  it("rejects negative carry or constructing", () => {
    expect(isEntity({ ...validUnit, carry: -1 })).toBe(false);
    expect(isEntity({ ...validUnit, constructing: -1 })).toBe(false);
  });

  it("rejects non-array queue", () => {
    expect(isEntity({ ...validUnit, queue: "wrong" })).toBe(false);
  });

  it("rejects invalid queue entries", () => {
    expect(isEntity({ ...validUnit, queue: ["invalid"] })).toBe(false);
  });

  it("rejects non-boolean marked or idle", () => {
    expect(isEntity({ ...validUnit, marked: 1 })).toBe(false);
    expect(isEntity({ ...validUnit, idle: "yes" })).toBe(false);
  });

  it("rejects invalid attackTarget", () => {
    expect(isEntity({ ...validUnit, attackTarget: -1 })).toBe(false);
  });

  it("rejects invalid producing shape", () => {
    expect(isEntity({ ...validBuilding, producing: "wrong" })).toBe(false);
    expect(isEntity({ ...validBuilding, producing: { kind: "invalid", remaining: 10 } })).toBe(false);
    expect(isEntity({ ...validBuilding, producing: { kind: "infantry", remaining: -1 } })).toBe(false);
  });

  it("rejects invalid gatherX/gatherY", () => {
    expect(isEntity({ ...validUnit, gatherX: NaN })).toBe(false);
    expect(isEntity({ ...validUnit, gatherY: Infinity })).toBe(false);
  });

  it("rejects invalid facing", () => {
    expect(isEntity({ ...validUnit, facing: -1 })).toBe(false);
    expect(isEntity({ ...validUnit, facing: 8 })).toBe(false);
  });

  it("rejects non-boolean repairing or neutral", () => {
    expect(isEntity({ ...validBuilding, repairing: 1 })).toBe(false);
    expect(isEntity({ ...validUnit, neutral: "yes" })).toBe(false);
  });

  it("rejects invalid scenarioRole", () => {
    expect(isEntity({ ...validUnit, scenarioRole: "invalid" })).toBe(false);
  });

  it("rejects invalid orderMode", () => {
    expect(isEntity({ ...validUnit, orderMode: "flee" })).toBe(false);
  });

  it("rejects invalid orderDestination", () => {
    expect(isEntity({ ...validUnit, orderDestination: "wrong" })).toBe(false);
  });

  it("rejects invalid stance", () => {
    expect(isEntity({ ...validUnit, stance: "retreat" })).toBe(false);
  });

  it("rejects negative suppression", () => {
    expect(isEntity({ ...validUnit, suppression: -1 })).toBe(false);
  });

  it("rejects invalid armor", () => {
    expect(isEntity({ ...validUnit, armor: "medium" })).toBe(false);
  });

  it("rejects invalid weapon", () => {
    expect(isEntity({ ...validUnit, weapon: "laser" })).toBe(false);
  });

  it("rejects invalid formation", () => {
    expect(isEntity({ ...validUnit, formation: "circle" })).toBe(false);
  });

  it("rejects negative blockedTicks", () => {
    expect(isEntity({ ...validUnit, blockedTicks: -1 })).toBe(false);
  });

  it("rejects invalid supportTargetId", () => {
    expect(isEntity({ ...validUnit, supportTargetId: -1 })).toBe(false);
  });

  it("rejects invalid supportMode", () => {
    expect(isEntity({ ...validUnit, supportMode: "invalid" })).toBe(false);
  });

  it("accepts rally points only on buildings", () => {
    expect(isEntity({ ...validBuilding, rallyPoint: { x: 8, y: 9 } })).toBe(true);
    expect(isEntity({ ...validUnit, rallyPoint: { x: 8, y: 9 } })).toBe(false);
    expect(isEntity({ ...validBuilding, rallyPoint: { x: 8 } })).toBe(false);
  });

  it("accepts pending refinery harvesters only on refinery buildings", () => {
    expect(isEntity({ ...validBuilding, kind: "refinery", refineryHarvesterPending: true })).toBe(true);
    expect(isEntity({ ...validUnit, refineryHarvesterPending: true })).toBe(false);
    expect(isEntity({ ...validBuilding, refineryHarvesterPending: true })).toBe(false);
    expect(isEntity({ ...validBuilding, kind: "refinery", refineryHarvesterPending: "yes" })).toBe(false);
  });
});

describe("isWin", () => {
  it("accepts valid win conditions", () => {
    expect(isWin({ kind: "annihilate" })).toBe(true);
    expect(isWin({ kind: "harvestQuota", target: 9000 })).toBe(true);
    expect(isWin({ kind: "escort", targetIds: [1, 2] })).toBe(true);
  });

  it("rejects non-record and invalid kind", () => {
    expect(isWin(null)).toBe(false);
    expect(isWin({ kind: "invalid" })).toBe(false);
  });

  it("rejects invalid optional fields", () => {
    expect(isWin({ kind: "annihilate", target: -1 })).toBe(false);
    expect(isWin({ kind: "annihilate", role: "invalid" })).toBe(false);
    expect(isWin({ kind: "annihilate", building: "invalid" })).toBe(false);
    expect(isWin({ kind: "annihilate", targetCount: -1 })).toBe(false);
    expect(isWin({ kind: "annihilate", targetIds: "wrong" })).toBe(false);
    expect(isWin({ kind: "annihilate", targetIds: [-1] })).toBe(false);
    expect(isWin({ kind: "annihilate", ticks: -1 })).toBe(false);
  });
});

describe("isNormalizableStateInput", () => {
  it("accepts minimal valid input", () => {
    expect(isNormalizableStateInput({ seed: 0, width: 1, height: 1, entities: [] })).toBe(true);
  });

  it("rejects non-record", () => {
    expect(isNormalizableStateInput(null)).toBe(false);
  });

  it("rejects invalid seed/dimensions", () => {
    expect(isNormalizableStateInput({ seed: -1, width: 1, height: 1, entities: [] })).toBe(false);
    expect(isNormalizableStateInput({ seed: 0, width: 0, height: 1, entities: [] })).toBe(false);
    expect(isNormalizableStateInput({ seed: 0, width: 257, height: 1, entities: [] })).toBe(false);
  });

  it("rejects area exceeding 256x256", () => {
    expect(isNormalizableStateInput({ seed: 0, width: 257, height: 256, entities: [] })).toBe(false);
  });

  it("rejects non-array entities", () => {
    expect(isNormalizableStateInput({ seed: 0, width: 1, height: 1, entities: "wrong" })).toBe(false);
  });

  it("rejects non-record entity entries", () => {
    expect(isNormalizableStateInput({ seed: 0, width: 1, height: 1, entities: ["bad"] })).toBe(false);
  });

  it("accepts with runtime field", () => {
    expect(isNormalizableStateInput({ seed: 0, width: 1, height: 1, entities: [], runtime: { targetIds: [1] } })).toBe(true);
  });

  it("rejects invalid runtime", () => {
    expect(isNormalizableStateInput({ seed: 0, width: 1, height: 1, entities: [], runtime: "bad" })).toBe(false);
  });
});

describe("isStateShape", () => {
  it("rejects non-record", () => {
    expect(isStateShape(null)).toBe(false);
    expect(isStateShape("string")).toBe(false);
  });

  it("rejects invalid dimensions", () => {
    expect(isStateShape({ width: 0, height: 1 })).toBe(false);
    expect(isStateShape({ width: 257, height: 1 })).toBe(false);
    expect(isStateShape({ width: 256, height: 256 })).toBe(false);
  });

  it("rejects invalid seed, missionIndex, tick", () => {
    expect(isStateShape({ width: 1, height: 1, seed: -1 })).toBe(false);
    expect(isStateShape({ width: 1, height: 1, seed: 0, missionIndex: 8 })).toBe(false);
    expect(isStateShape({ width: 1, height: 1, seed: 0, missionIndex: 0, tick: -1 })).toBe(false);
  });

  it("rejects invalid tiles array", () => {
    const base = { width: 1, height: 1, seed: 0, missionIndex: 0, tick: 0 };
    expect(isStateShape({ ...base, tiles: [] })).toBe(false);
    expect(isStateShape({ ...base, tiles: [99] })).toBe(false);
  });

  it("rejects invalid fog grid", () => {
    const base = { width: 1, height: 1, seed: 0, missionIndex: 0, tick: 0, tiles: [0], heights: [1], surfaces: [0], resourceAmount: [0], fog: [] };
    expect(isStateShape({ ...base, fog: [] })).toBe(false);
  });

  it("rejects duplicate entity ids", () => {
    const entity = { class: "unit", kind: "infantry", id: 1, owner: 0, x: 0, y: 0, hp: 100, maxHp: 100, cooldown: 0, path: [], carry: 0, constructing: 0, queue: [], marked: false, idle: false };
    const base = { width: 1, height: 1, seed: 0, missionIndex: 0, tick: 0, tiles: [0], heights: [1], surfaces: [0], resourceAmount: [0], fog: [0], nextId: 2, credits: [0, 0], creditsEarned: [0, 0], unitsProduced: [0, 0], unitsProducedByRole: { harvester: 0, infantry: 0, antiArmor: 0, tank: 0, medic: 0, repairTruck: 0 }, buildingsCompleted: [0, 0], buildingsCompletedByKind: {}, losses: { units: [0, 0], buildings: [0, 0] }, win: { kind: "annihilate" }, result: "playing", rngState: 0, factions: [{ id: 0, name: "A", adjective: "a", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }, { id: 1, name: "B", adjective: "b", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }], missionName: "Test" };
    expect(isStateShape({ ...base, entities: [entity, entity] })).toBe(false);
  });

  it("rejects impossible scenario progress and duplicate targets", () => {
    const overcounted = createMission({ seed: 421, missionIndex: 0 });
    overcounted.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [1],
      rescued: 2,
      required: 1,
      secondary: [],
    };
    expect(isStateShape(overcounted)).toBe(false);

    const duplicated = createMission({ seed: 421, missionIndex: 0 });
    duplicated.runtime = {
      kind: "escort",
      phase: "active",
      targetIds: [1, 1],
      rescued: 0,
      required: 2,
      secondary: [],
    };
    expect(isStateShape(duplicated)).toBe(false);
  });

  it("rejects entities and paths outside the saved map", () => {
    const entity = { class: "unit", kind: "infantry", id: 1, owner: 0, x: 0, y: 0, hp: 100, maxHp: 100, cooldown: 0, path: [], carry: 0, constructing: 0, queue: [], marked: false, idle: false };
    const base = { width: 1, height: 1, seed: 0, missionIndex: 0, tick: 0, tiles: [0], heights: [1], surfaces: [0], resourceAmount: [0], fog: [0], nextId: 2, credits: [0, 0], creditsEarned: [0, 0], unitsProduced: [0, 0], unitsProducedByRole: { harvester: 0, infantry: 0, antiArmor: 0, tank: 0, medic: 0, repairTruck: 0 }, buildingsCompleted: [0, 0], buildingsCompletedByKind: {}, losses: { units: [0, 0], buildings: [0, 0] }, win: { kind: "annihilate" }, result: "playing", rngState: 0, factions: [{ id: 0, name: "A", adjective: "a", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }, { id: 1, name: "B", adjective: "b", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }], missionName: "Test" };
    expect(isStateShape({ ...base, entities: [{ ...entity, x: 1 }] })).toBe(false);
    expect(isStateShape({ ...base, entities: [{ ...entity, path: [{ x: 1, y: 0 }] }] })).toBe(false);
  });

  it("rejects nextId too low for entities", () => {
    const entity = { class: "unit", kind: "infantry", id: 5, owner: 0, x: 0, y: 0, hp: 100, maxHp: 100, cooldown: 0, path: [], carry: 0, constructing: 0, queue: [], marked: false, idle: false };
    const base = { width: 1, height: 1, seed: 0, missionIndex: 0, tick: 0, tiles: [0], heights: [1], surfaces: [0], resourceAmount: [0], fog: [0], entities: [entity], nextId: 3, credits: [0, 0], creditsEarned: [0, 0], unitsProduced: [0, 0], unitsProducedByRole: { harvester: 0, infantry: 0, antiArmor: 0, tank: 0, medic: 0, repairTruck: 0 }, buildingsCompleted: [0, 0], buildingsCompletedByKind: {}, losses: { units: [0, 0], buildings: [0, 0] }, win: { kind: "annihilate" }, result: "playing", rngState: 0, factions: [{ id: 0, name: "A", adjective: "a", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }, { id: 1, name: "B", adjective: "b", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }], missionName: "Test" };
    expect(isStateShape(base)).toBe(false);
  });

  it("rejects invalid result", () => {
    const base = { width: 1, height: 1, seed: 0, missionIndex: 0, tick: 0, tiles: [0], heights: [1], surfaces: [0], resourceAmount: [0], fog: [0], entities: [], nextId: 1, credits: [0, 0], creditsEarned: [0, 0], unitsProduced: [0, 0], unitsProducedByRole: { harvester: 0, infantry: 0, antiArmor: 0, tank: 0, medic: 0, repairTruck: 0 }, buildingsCompleted: [0, 0], buildingsCompletedByKind: {}, losses: { units: [0, 0], buildings: [0, 0] }, win: { kind: "annihilate" }, result: "draw", rngState: 0, factions: [{ id: 0, name: "A", adjective: "a", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }, { id: 1, name: "B", adjective: "b", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }], missionName: "Test" };
    expect(isStateShape(base)).toBe(false);
  });

  it("rejects invalid lossReason", () => {
    const base = { width: 1, height: 1, seed: 0, missionIndex: 0, tick: 0, tiles: [0], heights: [1], surfaces: [0], resourceAmount: [0], fog: [0], entities: [], nextId: 1, credits: [0, 0], creditsEarned: [0, 0], unitsProduced: [0, 0], unitsProducedByRole: { harvester: 0, infantry: 0, antiArmor: 0, tank: 0, medic: 0, repairTruck: 0 }, buildingsCompleted: [0, 0], buildingsCompletedByKind: {}, losses: { units: [0, 0], buildings: [0, 0] }, win: { kind: "annihilate" }, result: "lost", lossReason: "timeout", rngState: 0, factions: [{ id: 0, name: "A", adjective: "a", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }, { id: 1, name: "B", adjective: "b", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }], missionName: "Test" };
    expect(isStateShape(base)).toBe(false);
  });

  it("rejects invalid biome", () => {
    const base = { width: 1, height: 1, seed: 0, missionIndex: 0, tick: 0, tiles: [0], heights: [1], surfaces: [0], resourceAmount: [0], fog: [0], entities: [], nextId: 1, credits: [0, 0], creditsEarned: [0, 0], unitsProduced: [0, 0], unitsProducedByRole: { harvester: 0, infantry: 0, antiArmor: 0, tank: 0, medic: 0, repairTruck: 0 }, buildingsCompleted: [0, 0], buildingsCompletedByKind: {}, losses: { units: [0, 0], buildings: [0, 0] }, win: { kind: "annihilate" }, result: "playing", rngState: 0, biome: "mars", factions: [{ id: 0, name: "A", adjective: "a", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }, { id: 1, name: "B", adjective: "b", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }], missionName: "Test" };
    expect(isStateShape(base)).toBe(false);
  });

  it("rejects invalid factions", () => {
    const base = { width: 1, height: 1, seed: 0, missionIndex: 0, tick: 0, tiles: [0], heights: [1], surfaces: [0], resourceAmount: [0], fog: [0], entities: [], nextId: 1, credits: [0, 0], creditsEarned: [0, 0], unitsProduced: [0, 0], unitsProducedByRole: { harvester: 0, infantry: 0, antiArmor: 0, tank: 0, medic: 0, repairTruck: 0 }, buildingsCompleted: [0, 0], buildingsCompletedByKind: {}, losses: { units: [0, 0], buildings: [0, 0] }, win: { kind: "annihilate" }, result: "playing", rngState: 0, factions: [], missionName: "Test" };
    expect(isStateShape(base)).toBe(false);
  });

  it("rejects invalid missionName", () => {
    const base = { width: 1, height: 1, seed: 0, missionIndex: 0, tick: 0, tiles: [0], heights: [1], surfaces: [0], resourceAmount: [0], fog: [0], entities: [], nextId: 1, credits: [0, 0], creditsEarned: [0, 0], unitsProduced: [0, 0], unitsProducedByRole: { harvester: 0, infantry: 0, antiArmor: 0, tank: 0, medic: 0, repairTruck: 0 }, buildingsCompleted: [0, 0], buildingsCompletedByKind: {}, losses: { units: [0, 0], buildings: [0, 0] }, win: { kind: "annihilate" }, result: "playing", rngState: 0, factions: [{ id: 0, name: "A", adjective: "a", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }, { id: 1, name: "B", adjective: "b", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }], missionName: 123 };
    expect(isStateShape(base)).toBe(false);
  });

  it("rejects invalid missionKind", () => {
    const base = { width: 1, height: 1, seed: 0, missionIndex: 0, tick: 0, tiles: [0], heights: [1], surfaces: [0], resourceAmount: [0], fog: [0], entities: [], nextId: 1, credits: [0, 0], creditsEarned: [0, 0], unitsProduced: [0, 0], unitsProducedByRole: { harvester: 0, infantry: 0, antiArmor: 0, tank: 0, medic: 0, repairTruck: 0 }, buildingsCompleted: [0, 0], buildingsCompletedByKind: {}, losses: { units: [0, 0], buildings: [0, 0] }, win: { kind: "annihilate" }, result: "playing", rngState: 0, missionKind: "invalid", factions: [{ id: 0, name: "A", adjective: "a", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }, { id: 1, name: "B", adjective: "b", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }], missionName: "Test" };
    expect(isStateShape(base)).toBe(false);
  });

  it("rejects invalid tutorialStage", () => {
    const base = { width: 1, height: 1, seed: 0, missionIndex: 0, tick: 0, tiles: [0], heights: [1], surfaces: [0], resourceAmount: [0], fog: [0], entities: [], nextId: 1, credits: [0, 0], creditsEarned: [0, 0], unitsProduced: [0, 0], unitsProducedByRole: { harvester: 0, infantry: 0, antiArmor: 0, tank: 0, medic: 0, repairTruck: 0 }, buildingsCompleted: [0, 0], buildingsCompletedByKind: {}, losses: { units: [0, 0], buildings: [0, 0] }, win: { kind: "annihilate" }, result: "playing", rngState: 0, factions: [{ id: 0, name: "A", adjective: "a", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }, { id: 1, name: "B", adjective: "b", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }], missionName: "Test", tutorialStage: "invalid" };
    expect(isStateShape(base)).toBe(false);
  });

  it("rejects invalid aiState", () => {
    const base = { width: 1, height: 1, seed: 0, missionIndex: 0, tick: 0, tiles: [0], heights: [1], surfaces: [0], resourceAmount: [0], fog: [0], entities: [], nextId: 1, credits: [0, 0], creditsEarned: [0, 0], unitsProduced: [0, 0], unitsProducedByRole: { harvester: 0, infantry: 0, antiArmor: 0, tank: 0, medic: 0, repairTruck: 0 }, buildingsCompleted: [0, 0], buildingsCompletedByKind: {}, losses: { units: [0, 0], buildings: [0, 0] }, win: { kind: "annihilate" }, result: "playing", rngState: 0, factions: [{ id: 0, name: "A", adjective: "a", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }, { id: 1, name: "B", adjective: "b", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }], missionName: "Test", aiState: "aggressive" };
    expect(isStateShape(base)).toBe(false);
  });

  it("rejects invalid aiRetreatTick", () => {
    const base = { width: 1, height: 1, seed: 0, missionIndex: 0, tick: 0, tiles: [0], heights: [1], surfaces: [0], resourceAmount: [0], fog: [0], entities: [], nextId: 1, credits: [0, 0], creditsEarned: [0, 0], unitsProduced: [0, 0], unitsProducedByRole: { harvester: 0, infantry: 0, antiArmor: 0, tank: 0, medic: 0, repairTruck: 0 }, buildingsCompleted: [0, 0], buildingsCompletedByKind: {}, losses: { units: [0, 0], buildings: [0, 0] }, win: { kind: "annihilate" }, result: "playing", rngState: 0, factions: [{ id: 0, name: "A", adjective: "a", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }, { id: 1, name: "B", adjective: "b", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }], missionName: "Test", aiRetreatTick: -1 };
    expect(isStateShape(base)).toBe(false);
  });

  it("rejects invalid aiRetreatLocked", () => {
    const base = { width: 1, height: 1, seed: 0, missionIndex: 0, tick: 0, tiles: [0], heights: [1], surfaces: [0], resourceAmount: [0], fog: [0], entities: [], nextId: 1, credits: [0, 0], creditsEarned: [0, 0], unitsProduced: [0, 0], unitsProducedByRole: { harvester: 0, infantry: 0, antiArmor: 0, tank: 0, medic: 0, repairTruck: 0 }, buildingsCompleted: [0, 0], buildingsCompletedByKind: {}, losses: { units: [0, 0], buildings: [0, 0] }, win: { kind: "annihilate" }, result: "playing", rngState: 0, factions: [{ id: 0, name: "A", adjective: "a", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }, { id: 1, name: "B", adjective: "b", palette: { primary: "#000", secondary: "#000", accent: "#000", outline: "#000", light: "#000", dark: "#000" } }], missionName: "Test", aiRetreatLocked: 1 };
    expect(isStateShape(base)).toBe(false);
  });
});

describe("isCampaignProgressShape", () => {
  it("accepts valid progress", () => {
    expect(isCampaignProgressShape({
      version: 1, seed: 421, tutorialComplete: true,
      unlockedMission: 2, completedMissions: [0, 1],
      medals: { "0": 1 }, bestScores: { "0": 100 },
    })).toBe(true);
  });

  it("rejects non-record", () => {
    expect(isCampaignProgressShape(null)).toBe(false);
  });

  it("rejects wrong version", () => {
    expect(isCampaignProgressShape({
      version: 2, seed: 421, tutorialComplete: true,
      unlockedMission: 0, completedMissions: [],
      medals: {}, bestScores: {},
    })).toBe(false);
  });

  it("rejects non-integer seed", () => {
    expect(isCampaignProgressShape({
      version: 1, seed: 1.5, tutorialComplete: true,
      unlockedMission: 0, completedMissions: [],
      medals: {}, bestScores: {},
    })).toBe(false);
  });

  it("rejects out-of-range seed", () => {
    expect(isCampaignProgressShape({
      version: 1, seed: 10000, tutorialComplete: true,
      unlockedMission: 0, completedMissions: [],
      medals: {}, bestScores: {},
    })).toBe(false);
  });

  it("rejects non-boolean tutorialComplete", () => {
    expect(isCampaignProgressShape({
      version: 1, seed: 421, tutorialComplete: "yes",
      unlockedMission: 0, completedMissions: [],
      medals: {}, bestScores: {},
    })).toBe(false);
  });

  it("rejects out-of-range unlockedMission", () => {
    expect(isCampaignProgressShape({
      version: 1, seed: 421, tutorialComplete: true,
      unlockedMission: -1, completedMissions: [],
      medals: {}, bestScores: {},
    })).toBe(false);
    expect(isCampaignProgressShape({
      version: 1, seed: 421, tutorialComplete: true,
      unlockedMission: 8, completedMissions: [],
      medals: {}, bestScores: {},
    })).toBe(false);
  });

  it("rejects non-array completedMissions", () => {
    expect(isCampaignProgressShape({
      version: 1, seed: 421, tutorialComplete: true,
      unlockedMission: 0, completedMissions: "wrong",
      medals: {}, bestScores: {},
    })).toBe(false);
  });

  it("rejects non-integer mission in completedMissions", () => {
    expect(isCampaignProgressShape({
      version: 1, seed: 421, tutorialComplete: true,
      unlockedMission: 2, completedMissions: [1.5],
      medals: {}, bestScores: {},
    })).toBe(false);
  });

  it("rejects out-of-range mission in completedMissions", () => {
    expect(isCampaignProgressShape({
      version: 1, seed: 421, tutorialComplete: true,
      unlockedMission: 2, completedMissions: [8],
      medals: {}, bestScores: {},
    })).toBe(false);
  });

  it("rejects duplicate missions", () => {
    expect(isCampaignProgressShape({
      version: 1, seed: 421, tutorialComplete: true,
      unlockedMission: 2, completedMissions: [1, 1],
      medals: {}, bestScores: {},
    })).toBe(false);
  });

  it("rejects mission exceeding unlockedMission", () => {
    expect(isCampaignProgressShape({
      version: 1, seed: 421, tutorialComplete: true,
      unlockedMission: 1, completedMissions: [0, 2],
      medals: {}, bestScores: {},
    })).toBe(false);
  });

  it("rejects non-record medals or bestScores", () => {
    expect(isCampaignProgressShape({
      version: 1, seed: 421, tutorialComplete: true,
      unlockedMission: 0, completedMissions: [],
      medals: "wrong", bestScores: {},
    })).toBe(false);
    expect(isCampaignProgressShape({
      version: 1, seed: 421, tutorialComplete: true,
      unlockedMission: 0, completedMissions: [],
      medals: {}, bestScores: "wrong",
    })).toBe(false);
  });

  it("rejects invalid medals keys", () => {
    expect(isCampaignProgressShape({
      version: 1, seed: 421, tutorialComplete: true,
      unlockedMission: 0, completedMissions: [],
      medals: { "abc": 1 }, bestScores: {},
    })).toBe(false);
  });

  it("rejects non-finite medal scores", () => {
    expect(isCampaignProgressShape({
      version: 1, seed: 421, tutorialComplete: true,
      unlockedMission: 0, completedMissions: [],
      medals: { "0": NaN }, bestScores: {},
    })).toBe(false);
  });

  it("rejects negative medal scores", () => {
    expect(isCampaignProgressShape({
      version: 1, seed: 421, tutorialComplete: true,
      unlockedMission: 0, completedMissions: [],
      medals: { "0": -1 }, bestScores: {},
    })).toBe(false);
  });
});

describe("assertSupportedContentVersion", () => {
  it("does not throw for the current version", () => {
    expect(() => assertSupportedContentVersion(SAVE_CONTENT_VERSION)).not.toThrow();
  });

  it("accepts older integer versions up to a later current format", () => {
    expect(() => assertSupportedContentVersion(1, 2)).not.toThrow();
    expect(() => assertSupportedContentVersion(2, 2)).not.toThrow();
  });

  it("throws for a wrong version", () => {
    expect(() => assertSupportedContentVersion(SAVE_CONTENT_VERSION + 1)).toThrow("Unsupported save content version");
    expect(() => assertSupportedContentVersion(0, 2)).toThrow("Unsupported save content version");
    expect(() => assertSupportedContentVersion(3, 2)).toThrow("Unsupported save content version");
    expect(() => assertSupportedContentVersion("1")).toThrow("Unsupported save content version");
  });
});

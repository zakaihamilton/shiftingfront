import { describe, expect, it } from "vitest";
import { BUILDING_STATS } from "../../lib/catalog";
import { evaluateObjectives, objectiveProgress } from "../../lib/sim/objectives";
import { createTutorialMission, enterTutorialStage, tutorialBuildTile, tutorialCommandCompletesStage, tutorialMoveTile, tutorialPrompt, tutorialSelectionCompletesStage, tutorialTargets } from "../../lib/sim/tutorial";
import { addBuilding, makeFixture } from "../../lib/sim/fixtures";
import { canPlaceBuilding, isWalkable } from "../../lib/sim/world";
import { fogAt } from "../../lib/sim/fog";
import { issue, tick } from "../../lib/sim/api";

describe("tutorial", () => {
  it("creates a seed 0000 training mission with no time limit", () => {
    const state = createTutorialMission();
    expect(state.seed).toBe(0);
    expect(state.tutorialStage).toBe("select");
    expect(state.missionName).toBe("Shifting Front Training Range");
    expect(state.missionKind).toBe("holdTheLine");
    expect(state.win).toEqual({ kind: "holdTheLine" });
    expect(state.win.ticks).toBeUndefined();
    expect(state.runtime?.kind).toBe("holdTheLine");
    expect(state.runtime?.deadline).toBeUndefined();
    expect(state.runtime?.director).toBeUndefined();
    expect(state.runtime?.targetIds).toEqual([]);
    expect(state.entities.some((entity) => entity.neutral || entity.scenarioRole)).toBe(false);
    expect(objectiveProgress(state).label).toBe("Training range — no time limit");
  });

  it("does not win from elapsed time", () => {
    const state = createTutorialMission();
    state.tick = 12 * 60 * 60;
    expect(evaluateObjectives(state)).toEqual([]);
    expect(state.result).toBe("playing");
  });

  it("deletes the director from runtime if present", () => {
    const state = createTutorialMission();
    expect(state.runtime).toBeDefined();
    expect(state.runtime?.director).toBeUndefined();
  });

  it("returns the select prompt for the select stage", () => {
    const state = createTutorialMission();
    expect(tutorialPrompt(state)).toBe("Tap or click your Infantry to select it.");
  });

  it("returns the move prompt for the move stage", () => {
    const state = createTutorialMission();
    state.tutorialStage = "move";
    expect(tutorialPrompt(state)).toBe("Move the selected unit to the highlighted ground (right click).");
  });

  it("returns the build prompt for the build stage", () => {
    const state = createTutorialMission();
    state.tutorialStage = "build";
    expect(tutorialPrompt(state)).toBe("Open Construction, choose Power Plant, then place it at the highlighted site.");
  });

  it("returns the produce prompt for the produce stage", () => {
    const state = createTutorialMission();
    state.tutorialStage = "produce";
    expect(tutorialPrompt(state)).toBe("Open Production and queue one Infantry.");
  });

  it("returns the attack prompt for the attack stage", () => {
    const state = createTutorialMission();
    state.tutorialStage = "attack";
    expect(tutorialPrompt(state)).toBe("Select a combat unit, then attack the highlighted drill target.");
  });

  it("returns the repair prompt for the repair stage", () => {
    const state = createTutorialMission();
    state.tutorialStage = "repair";
    expect(tutorialPrompt(state)).toBe("Activate Repair, then click the highlighted damaged structure.");
  });

  it("returns the complete prompt for the complete stage", () => {
    const state = createTutorialMission();
    state.tutorialStage = "complete";
    expect(tutorialPrompt(state)).toBe("Training complete. Return to the command desk when ready.");
  });

  it("returns the complete prompt for undefined stage", () => {
    const state = createTutorialMission();
    state.tutorialStage = undefined;
    expect(tutorialPrompt(state)).toBe("Training complete. Return to the command desk when ready.");
  });

  it("resolves a live target for each interactive stage", () => {
    const state = createTutorialMission();
    const stages = ["select", "move", "build", "produce", "attack", "repair", "complete"] as const;
    for (const stage of stages) {
      enterTutorialStage(state, stage);
      if (stage === "produce") expect(tutorialTargets(state), stage).toHaveLength(0);
      else expect(tutorialTargets(state), stage).not.toHaveLength(0);
    }
    expect(tutorialBuildTile(state)).not.toBeNull();
  });

  it("advances selection only for the highlighted Infantry", () => {
    const state = createTutorialMission();
    const harvester = state.entities.find((entity) => entity.owner === 0 && entity.kind === "harvester")!;
    const infantry = state.entities.find((entity) => entity.owner === 0 && entity.kind === "infantry")!;
    expect(tutorialSelectionCompletesStage(state, [harvester.id])).toBe(false);
    expect(tutorialSelectionCompletesStage(state, [infantry.id])).toBe(true);
  });

  it("highlights a nearby walkable tile during the move stage", () => {
    const state = createTutorialMission();
    expect(tutorialMoveTile(state)).toBeNull();
    enterTutorialStage(state, "move");
    const tile = tutorialMoveTile(state);
    const infantry = state.entities.find((entity) => entity.owner === 0 && entity.kind === "infantry" && entity.hp > 0);
    expect(tile).not.toBeNull();
    expect(infantry).toBeDefined();
    expect(tile).not.toEqual({ x: Math.round(infantry!.x), y: Math.round(infantry!.y) });
    expect(isWalkable(state, tile!.x, tile!.y)).toBe(true);
  });

  it("matches the build coach target to the real placement footprint", () => {
    const state = createTutorialMission();
    enterTutorialStage(state, "build");
    const target = tutorialTargets(state).find((candidate) => candidate.kind === "tile");
    const yard = state.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard")!;
    expect(target).toMatchObject({ footprint: BUILDING_STATS.power.footprint });
    expect(target?.kind).toBe("tile");
    if (target?.kind === "tile") {
      expect(canPlaceBuilding(state, "power", target.x, target.y)).toBe(true);
      expect(target.x + target.y).toBeLessThan(yard.x + yard.y);
    }
  });

  it("damages a finished friendly building when the repair stage begins", () => {
    const state = createTutorialMission();
    const building = state.entities.find((entity) => entity.owner === 0 && entity.class === "building" && entity.constructing === 0 && entity.hp === entity.maxHp);
    expect(building).toBeDefined();
    const full = building!.hp;
    enterTutorialStage(state, "repair");
    expect(state.tutorialStage).toBe("repair");
    expect(building!.hp).toBe(Math.max(1, Math.floor(full / 2)));
    enterTutorialStage(state, "repair");
    expect(building!.hp).toBe(Math.max(1, Math.floor(full / 2)));
  });

  it("does not damage another building if one is already damaged", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const yard = addBuilding(state, 0, "constructionYard", 2, 2);
    const power = addBuilding(state, 0, "power", 6, 2);
    power.hp = power.maxHp - 4;
    enterTutorialStage(state, "repair");
    expect(yard.hp).toBe(yard.maxHp);
    expect(power.hp).toBe(power.maxHp - 4);
  });

  it("does not halve a second full building on re-entry", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const yard = addBuilding(state, 0, "constructionYard", 2, 2);
    const power = addBuilding(state, 0, "power", 6, 2);
    enterTutorialStage(state, "repair");
    expect([yard, power].filter((building) => building.hp < building.maxHp)).toHaveLength(1);
    enterTutorialStage(state, "repair");
    expect([yard, power].filter((building) => building.hp < building.maxHp)).toHaveLength(1);
  });

  it("advances only when the expected action is performed", () => {
    const state = createTutorialMission();
    enterTutorialStage(state, "move");
    const infantry = state.entities.find((entity) => entity.owner === 0 && entity.kind === "infantry")!;
    const harvester = state.entities.find((entity) => entity.owner === 0 && entity.kind === "harvester")!;
    const moveTile = tutorialMoveTile(state)!;

    issue(state, { type: "move", unitIds: [harvester.id], x: moveTile.x, y: moveTile.y });
    expect(state.tutorialStage).toBe("move");
    expect(tutorialCommandCompletesStage(state, { type: "move", unitIds: [infantry.id], x: moveTile.x, y: moveTile.y })).toBe(true);

    issue(state, { type: "move", unitIds: [infantry.id], x: moveTile.x, y: moveTile.y });
    expect(state.tutorialStage).toBe("build");
  });

  it("spawns one passive drill target when attack training begins", () => {
    const state = createTutorialMission();
    const infantry = state.entities.find((entity) => entity.owner === 0 && entity.kind === "infantry")!;
    const barracks = state.entities.find((entity) => entity.owner === 0 && entity.kind === "barracks")!;
    const enemyEntities = state.entities.filter((entity) => entity.owner === 1 && entity.hp > 0);
    expect(enemyEntities.every((entity) => entity.stance === "hold" && entity.attackTarget === undefined)).toBe(true);

    enterTutorialStage(state, "attack");
    const firstId = state.tutorialTargetId;
    expect(firstId).toBeDefined();
    const target = state.entities.find((entity) => entity.id === firstId);
    expect(target).toMatchObject({ owner: 1, kind: "infantry", stance: "hold", idle: true });
    expect(Math.hypot(target!.x - infantry.x, target!.y - infantry.y)).toBeGreaterThan(6.4);
    expect(Math.hypot(target!.x - barracks.x, target!.y - barracks.y)).toBeGreaterThan(8);
    expect(fogAt(state, Math.round((barracks.x + target!.x) / 2), Math.round((barracks.y + target!.y) / 2))).toBe(2);
    const count = state.entities.length;

    enterTutorialStage(state, "attack");
    expect(state.entities).toHaveLength(count);
    expect(state.tutorialTargetId).toBe(firstId);
  });

  it("keeps the enemy base from producing or attacking during training", () => {
    const state = createTutorialMission();
    const initialCount = state.entities.length;
    tick(state, undefined, { collectEvents: false });
    expect(state.entities).toHaveLength(initialCount);
    expect(state.entities.filter((entity) => entity.owner === 1).every((entity) => entity.attackTarget === undefined)).toBe(true);
  });

  it("requires the spawned drill target for attack completion", () => {
    const state = createTutorialMission();
    enterTutorialStage(state, "attack");
    const infantry = state.entities.find((entity) => entity.owner === 0 && entity.kind === "infantry")!;
    const target = state.entities.find((entity) => entity.id === state.tutorialTargetId)!;
    expect(tutorialCommandCompletesStage(state, { type: "attack", unitIds: [infantry.id], targetId: target.id })).toBe(true);
    expect(tutorialCommandCompletesStage(state, { type: "attackMove", unitIds: [infantry.id], x: target.x, y: target.y })).toBe(true);
  });

  it("waits for the drill target to die before opening repair", () => {
    const state = createTutorialMission();
    enterTutorialStage(state, "attack");
    const infantry = state.entities.find((entity) => entity.owner === 0 && entity.kind === "infantry")!;
    const target = state.entities.find((entity) => entity.id === state.tutorialTargetId)!;

    issue(state, { type: "attack", unitIds: [infantry.id], targetId: target.id });
    expect(state.tutorialStage).toBe("attack");
    tick(state, undefined, { collectEvents: false });
    expect(state.tutorialStage).toBe("attack");

    target.hp = 0;
    tick(state, undefined, { collectEvents: false });
    expect(state.tutorialStage).toBe("repair");
  });
});

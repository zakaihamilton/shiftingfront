import { describe, expect, it } from "vitest";
import { createSkirmish, issue } from "@/lib/sim/api";
import { tickCombat } from "@/lib/sim/combat";
import { addBuilding, addUnit, makeFixture } from "@/lib/sim/fixtures";
import { fogAt } from "@/lib/sim/fog";
import { evaluateObjectives } from "@/lib/sim/objectives";
import { SIMULATION_SYSTEMS, createSimulationTickContext } from "@/lib/sim/pipeline";
import { tickProduction } from "@/lib/sim/production";
import { isPlayerControlledOwner } from "@/lib/sim/ownership";
import { invalidateEntityCaches, powerFor } from "@/lib/sim/world";
import type { Owner } from "@/lib/types";

const ALL_PLAYERS: Owner[] = [0, 1, 2, 3];

function countsByOwner(state: ReturnType<typeof createSkirmish>["state"], owner: Owner) {
  return state.entities.filter((entity) => entity.owner === owner && entity.hp > 0)
    .map((entity) => `${entity.class}:${entity.kind}`).sort();
}

function constructionYard(state: ReturnType<typeof createSkirmish>["state"], owner: Owner) {
  return state.entities.find((entity) => entity.owner === owner && entity.kind === "constructionYard")!;
}

describe("free-for-all skirmish simulation", () => {
  it("creates four equivalent corner forces and resources without campaign AI", () => {
    const { state } = createSkirmish(8123, 0, ALL_PLAYERS);
    expect(state.multiplayer).toBe(true);
    expect(state.multiplayerOwners).toEqual(ALL_PLAYERS);
    expect(state.viewOwner).toBe(0);
    for (const owner of [1, 2, 3] as const) expect(countsByOwner(state, owner)).toEqual(countsByOwner(state, 0));
    expect(ALL_PLAYERS.map((owner) => constructionYard(state, owner))).toMatchObject([
      { x: 5, y: 5 }, { x: 74, y: 5 }, { x: 74, y: 74 }, { x: 5, y: 74 },
    ]);
    expect(state.runtime).toBeUndefined();
    expect(state.aiState).toBeUndefined();
    expect(state.entities.some((entity) => entity.neutral || entity.scenarioRole !== undefined || entity.kind === "objective")).toBe(false);
    expect(state.credits).toEqual([2000, 2000, 2000, 2000]);
    expect(ALL_PLAYERS.map((owner) => powerFor(state, owner))).toEqual([powerFor(state, 0), powerFor(state, 0), powerFor(state, 0), powerFor(state, 0)]);
    for (const owner of [1, 2, 3] as const) expect(countsByOwner(createSkirmish(8123, owner, ALL_PLAYERS).state, owner)).toEqual(countsByOwner(state, owner));
    SIMULATION_SYSTEMS.find((system) => system.id === "ai")!.run(createSimulationTickContext(state, undefined, {}));
    expect(state.unitsProduced).toEqual([0, 0, 0, 0]);
    expect(state.aiState).toBeUndefined();
  });

  it("reveals each player's own corner while keeping the other three under fog", () => {
    const state = createSkirmish(8123, 2, ALL_PLAYERS).state;
    for (const owner of ALL_PLAYERS) {
      const yard = constructionYard(state, owner);
      expect(fogAt(state, yard.x, yard.y)).toBe(owner === 2 ? 2 : 0);
    }
  });

  it("applies player-only path behavior to every active multiplayer seat", () => {
    const state = createSkirmish(8123, 2, [0, 2, 3]).state;
    expect([0, 1, 2, 3].map((owner) => isPlayerControlledOwner(state, owner as Owner)))
      .toEqual([true, false, true, true]);

    const campaign = makeFixture({ win: { kind: "annihilate" } });
    expect(isPlayerControlledOwner(campaign, 0)).toBe(true);
    expect(isPlayerControlledOwner(campaign, 1)).toBe(false);
  });

  it("applies power-deficit production, construction, turret, and warning behavior to owners 2 and 3", () => {
    for (const owner of [2, 3] as const) {
      const { state } = createSkirmish(8123, owner, ALL_PLAYERS);
      const power = state.entities.find((entity) => entity.owner === owner && entity.kind === "power")!;
      power.hp = 0;
      invalidateEntityCaches(state);
      expect(powerFor(state, owner)).toBeLessThan(0);

      const factory = state.entities.find((entity) => entity.owner === owner && entity.kind === "factory")!;
      factory.producing = { kind: "tank", remaining: 20 };
      const turret = state.entities.find((entity) => entity.owner === owner && entity.kind === "turret")!;
      turret.constructing = 5;
      turret.cooldown = 10;

      const events = tickProduction(state);
      expect(factory.producing.remaining).toBe(20);
      expect(turret.constructing).toBe(5);
      expect(events).toContainEqual({ type: "powerShortage", owner });

      state.tick = 1;
      tickCombat(state);
      expect(turret.cooldown).toBe(10);
    }
  });

  it("allows each seat to control only its own production and attack every rival", () => {
    const state = createSkirmish(8123, 0, ALL_PLAYERS).state;
    for (const owner of ALL_PLAYERS) {
      const barracks = state.entities.find((entity) => entity.owner === owner && entity.kind === "barracks")!;
      issue(state, { type: "produce", fromId: barracks.id, unit: "infantry", owner });
      expect(barracks.producing?.kind).toBe("infantry");

      const tank = state.entities.find((entity) => entity.owner === owner && entity.kind === "tank")!;
      const rival = state.entities.find((entity) => entity.owner === ((owner + 1) % 4) && entity.kind === "constructionYard")!;
      expect(issue(state, { type: "attack", unitIds: [tank.id], targetId: rival.id, owner })
        .some((event) => event.type === "commandRejected")).toBe(false);

      const rivalBarracks = state.entities.find((entity) => entity.owner === ((owner + 1) % 4) && entity.kind === "barracks")!;
      expect(issue(state, { type: "produce", fromId: rivalBarracks.id, unit: "infantry", owner })
        .some((event) => event.type === "commandRejected")).toBe(true);
    }
  });

  it("keeps owner 1 skirmish attack orders on their assigned passive target", () => {
    const state = makeFixture({ width: 48, height: 24, win: { kind: "annihilate" } });
    state.multiplayer = true;
    state.multiplayerOwners = [0, 1];
    state.viewOwner = 1;
    const attacker = addUnit(state, 1, "tank", 10, 10);
    const assigned = addBuilding(state, 0, "power", 30, 10);
    addUnit(state, 0, "infantry", 11, 10);
    attacker.idle = false;
    attacker.orderMode = "attack";
    attacker.attackTarget = assigned.id;

    tickCombat(state);

    expect(attacker.attackTarget).toBe(assigned.id);
  });

  it("eliminates destroyed yards, awards the last surviving seat, and draws on a simultaneous wipe", () => {
    const winner = createSkirmish(8123, 3, ALL_PLAYERS).state;
    for (const owner of [0, 1, 2] as const) constructionYard(winner, owner).hp = 0;
    invalidateEntityCaches(winner);
    evaluateObjectives(winner);
    expect(winner.result).toBe("won");
    expect(winner.winner).toBe(3);
    expect(winner.entities.filter((entity) => entity.owner !== 3 && entity.hp > 0)).toHaveLength(0);

    const draw = createSkirmish(8123, 0, ALL_PLAYERS).state;
    for (const owner of ALL_PLAYERS) constructionYard(draw, owner).hp = 0;
    invalidateEntityCaches(draw);
    evaluateObjectives(draw);
    expect(draw.result).toBe("lost");
    expect(draw.winner).toBeNull();
  });
});

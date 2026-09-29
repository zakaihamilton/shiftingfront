import { describe, expect, it } from "vitest";
import { createSkirmish, issue, tick } from "@/lib/sim/api";
import { tickCombat } from "@/lib/sim/combat";
import { addBuilding, addUnit, makeFixture } from "@/lib/sim/fixtures";
import { fogAt } from "@/lib/sim/fog";
import { evaluateObjectives } from "@/lib/sim/objectives";
import { SIMULATION_SYSTEMS, createSimulationTickContext } from "@/lib/sim/pipeline";
import { tickProduction } from "@/lib/sim/production";
import { isPlayerControlledOwner } from "@/lib/sim/ownership";
import { findBuildSite, invalidateEntityCaches, powerFor } from "@/lib/sim/world";
import { tickMultiplayerAi } from "@/lib/sim/ai";
import { updateAiContacts } from "@/lib/sim/ai/visibility";
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

  it("runs multiple bots with separate state and produces deterministic lockstep decisions", () => {
    const owners: Owner[] = [0, 1, 2, 3];
    const aiOwners: Owner[] = [1, 2];
    const host = createSkirmish(8123, 0, owners, aiOwners).state;
    const guest = createSkirmish(8123, 3, owners, aiOwners).state;
    expect(host.multiplayerAiOwners).toEqual(aiOwners);
    updateAiContacts(host, 1, [0, 2, 3]);
    updateAiContacts(host, 2, [0, 1, 3]);
    expect(host.multiplayerAiMemory?.[1]?.contacts).toBeDefined();
    expect(host.multiplayerAiMemory?.[2]?.contacts).toBeDefined();
    expect(host.multiplayerAiMemory?.[1]?.contacts).not.toBe(host.multiplayerAiMemory?.[2]?.contacts);

    for (let index = 0; index < 300; index += 1) {
      tick(host, [], { collectEvents: false, updateFog: false });
      tick(guest, [], { collectEvents: false, updateFog: false });
    }
    expect(guest.entities).toEqual(host.entities);
    expect(guest.credits).toEqual(host.credits);
    expect(guest.rngState).toBe(host.rngState);
    expect(guest.multiplayerAiMemory).toEqual(host.multiplayerAiMemory);
    for (const owner of aiOwners) {
      expect(
        (host.unitsProduced[owner] ?? 0) > 0
        || host.productionQueues?.[owner]?.barracks?.producing !== undefined
        || host.productionQueues?.[owner]?.factory?.producing !== undefined,
      ).toBe(true);
      expect(Object.keys(host.multiplayerAiMemory?.[owner]?.contacts ?? {}).length).toBeGreaterThan(0);
    }
  });

  it("sends bot forces after rival yards in free-for-all combat", () => {
    const aiOwners: Owner[] = [1, 3];
    const state = createSkirmish(8123, 0, ALL_PLAYERS, aiOwners).state;
    state.tick = 6960;
    tickMultiplayerAi(state);

    for (const owner of aiOwners) {
      const assignedTargets = state.entities
        .filter((entity) => entity.owner === owner && entity.class === "unit" && entity.attackTarget !== undefined)
        .map((entity) => state.entities.find((target) => target.id === entity.attackTarget))
        .filter((target) => target !== undefined);
      expect(assignedTargets.length).toBeGreaterThan(0);
      expect(assignedTargets.every((target) => target.owner !== owner && ALL_PLAYERS.includes(target.owner))).toBe(true);
    }
  });

  it("starts with AI seats only when every AI seat is an active non-host player", () => {
    const { state } = createSkirmish(8123, 0, [0, 2, 3], [2, 3]);
    expect(state.multiplayerOwners).toEqual([0, 2, 3]);
    expect(state.multiplayerAiOwners).toEqual([2, 3]);
    expect(() => createSkirmish(8123, 0, [0, 1], [2])).toThrow("valid human and AI seats");
    expect(() => createSkirmish(8123, 0, [0, 1], [0])).toThrow("valid human and AI seats");
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

    const withBot = createSkirmish(8123, 0, [0, 1, 2], [2]).state;
    expect([0, 1, 2, 3].map((owner) => isPlayerControlledOwner(withBot, owner as Owner)))
      .toEqual([true, true, false, false]);
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
      expect(state.productionQueues?.[owner]?.factory?.producing?.remaining).toBe(20);
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
      expect(state.productionQueues?.[owner]?.barracks?.producing?.kind).toBe("infantry");

      const tank = state.entities.find((entity) => entity.owner === owner && entity.kind === "tank")!;
      const rival = state.entities.find((entity) => entity.owner === ((owner + 1) % 4) && entity.kind === "constructionYard")!;
      expect(issue(state, { type: "attack", unitIds: [tank.id], targetId: rival.id, owner })
        .some((event) => event.type === "commandRejected")).toBe(false);

      const rivalBarracks = state.entities.find((entity) => entity.owner === ((owner + 1) % 4) && entity.kind === "barracks")!;
      const rejectionEvents = issue(state, { type: "produce", fromId: rivalBarracks.id, unit: "infantry", owner });
      expect(rejectionEvents.some((event) => event.type === "commandRejected")).toBe(true);
      expect(rejectionEvents.find((event) => event.type === "commandRejected")).toMatchObject({ owner });
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

  it("allows guest seats (owners 1, 2, 3) to place buildings near their own construction yards", () => {
    const state = createSkirmish(8123, 0, ALL_PLAYERS).state;
    for (const owner of [1, 2, 3] as const) {
      const yard = constructionYard(state, owner);
      const site = findBuildSite(state, "power", yard.x, yard.y, 12, owner)!;
      expect(site).toBeDefined();
      const events = issue(state, { type: "build", building: "power", x: site.x, y: site.y, owner });
      expect(events.some((event) => event.type === "commandRejected")).toBe(false);
      expect(state.entities.some((entity) => entity.owner === owner && entity.kind === "power" && entity.constructing > 0)).toBe(true);
    }
  });

  it("emits elimination alerts and eliminates forces when a player's Command HQ falls in a 4-player FFA", () => {
    const state = createSkirmish(8123, 0, ALL_PLAYERS).state;
    // Destroy owner 1's yard
    constructionYard(state, 1).hp = 0;
    invalidateEntityCaches(state);
    const events = evaluateObjectives(state);

    // Host (owner 0) sees owner 1 eliminated
    expect(events).toContainEqual({
      type: "alert",
      kind: "warning",
      text: "Player 2 eliminated.",
    });
    expect(state.result).toBe("playing");
    expect(state.entities.filter((entity) => entity.owner === 1 && entity.hp > 0)).toHaveLength(0);

    // Destroy owner 0's yard viewed by owner 0
    constructionYard(state, 0).hp = 0;
    invalidateEntityCaches(state);
    const nextEvents = evaluateObjectives(state);
    expect(nextEvents).toContainEqual({
      type: "alert",
      kind: "warning",
      text: "Command HQ destroyed — your forces have been eliminated.",
    });
    expect(state.result).toBe("playing");
    const tickBeforeHostElimination = state.tick;
    tick(state, [], { collectEvents: false });
    expect(state.tick).toBe(tickBeforeHostElimination + 1);
    expect(state.result).toBe("playing");
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

  it("plans forward infrastructure using the correct AI seat rather than hardcoding seat 1", async () => {
    const { state } = createSkirmish(8123, 0, ALL_PLAYERS, [2, 3]);
    const yard2 = constructionYard(state, 2);
    // Point closer to seat 2's corner (bottom-right: x ~ 48, y ~ 48 in a 64x64 arena)
    const targetPoint = { x: yard2.x - 6, y: yard2.y - 6 };
    const { forwardRelaySite, forwardRefinerySite } = await import("@/lib/sim/ai/helpers");
    const relaySpot = forwardRelaySite(state, yard2, targetPoint, 2);
    expect(relaySpot).toBeDefined();

    const refinerySpot = forwardRefinerySite(state, yard2, targetPoint, 2);
    // If it placed properly near seat 2, spot is defined
    if (refinerySpot) {
      expect(Math.abs(refinerySpot.x - yard2.x)).toBeLessThan(20);
    }
  });
});

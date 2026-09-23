import { describe, expect, it } from "vitest";
import { createCampaign } from "../../lib/gen/campaign";
import { BUILDING_STATS } from "../../lib/catalog";
import { createMission, inspect, tick } from "../../lib/sim/api";
import { createScenarioRunner } from "../../lib/sim/scenarioRunner";
import { CompetentCommander } from "../../lib/sim/commander";
import { assaultReady, defensiveThreat, yardRaid } from "../../lib/sim/commander/combat";
import { planBuilding, planProduction } from "../../lib/sim/commander/production";
import { missionDifficulty } from "../../lib/sim/difficulty";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { enemyEntities, playerBuildings, playerUnits } from "../../lib/sim/commander/queries";
import { invalidateEntityCaches, living, powerBreakdown, unitAt } from "../../lib/sim/world";

describe("competent commander", () => {
  it("keeps timed sabotage on the normal HQ response radius", () => {
    const sabotage = makeFixture({ width: 40, height: 40, win: { kind: "sabotage", targetCount: 1, ticks: 1000 } });
    const sabotageYard = addBuilding(sabotage, 0, "constructionYard", 5, 5);
    addUnit(sabotage, 1, "infantry", 25, 5);

    expect(defensiveThreat(sabotage, sabotageYard)).toBeUndefined();

    const assault = makeFixture({ width: 40, height: 40, win: { kind: "annihilate" } });
    const assaultYard = addBuilding(assault, 0, "constructionYard", 5, 5);
    addUnit(assault, 1, "infantry", 25, 5);

    expect(defensiveThreat(assault, assaultYard)).toBeDefined();
  });

  it("keeps decapitation on the normal HQ response radius", () => {
    const state = makeFixture({ width: 40, height: 40, win: { kind: "decapitate", ticks: 5000 } });
    const yard = addBuilding(state, 0, "constructionYard", 5, 5);
    addUnit(state, 1, "infantry", 25, 5);

    expect(defensiveThreat(state, yard)).toBeUndefined();
  });

  it("treats a lone infantry as a scout and a tank as a yard raid", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "decapitate", ticks: 5000 } });
    const yard = addBuilding(state, 0, "constructionYard", 5, 5);
    addUnit(state, 1, "infantry", 6, 5);

    expect(yardRaid(state, yard)).toBe(false);

    addUnit(state, 1, "tank", 7, 5);
    expect(yardRaid(state, yard)).toBe(true);
  });

  it("returns snapshots instead of exposing cached query state", () => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "annihilate" } });
    const building = addBuilding(state, 0, "power", 2, 2);
    const unit = addUnit(state, 0, "infantry", 4, 4);
    const enemy = addUnit(state, 1, "infantry", 15, 15);

    playerBuildings(state).length = 0;
    playerUnits(state).length = 0;
    enemyEntities(state).length = 0;
    const totals = powerBreakdown(state, 0);
    totals.produced = 0;
    totals.surplus = 0;

    expect(playerBuildings(state)).toContainEqual(building);
    expect(playerUnits(state)).toContainEqual(unit);
    expect(enemyEntities(state)).toContainEqual(enemy);
    expect(powerBreakdown(state, 0)).toMatchObject({ produced: 50, used: 0, surplus: 50 });
  });

  it("refreshes all entity-derived queries after a structural mutation", () => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "annihilate" } });
    const power = addBuilding(state, 0, "power", 2, 2);
    const unit = addUnit(state, 0, "infantry", 4, 4);

    expect(living(state)).toContainEqual(unit);
    expect(unitAt(state, 4, 4)?.id).toBe(unit.id);
    expect(powerBreakdown(state, 0).produced).toBe(BUILDING_STATS.power.power);

    unit.hp = 0;
    power.hp = 0;
    invalidateEntityCaches(state);

    expect(living(state)).not.toContainEqual(unit);
    expect(unitAt(state, 4, 4)).toBeUndefined();
    expect(powerBreakdown(state, 0).produced).toBe(0);
  });

  it("queues a force-quota role and wins through the public command API", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "forceQuota", role: "tank", target: 1 } });
    addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    addBuilding(state, 0, "factory", 2, 5);
    addBuilding(state, 1, "constructionYard", 18, 18);
    const commander = new CompetentCommander();

    for (let i = 0; i < BUILDING_STATS.factory.buildTicks + 30 && state.result === "playing"; i++) {
      tick(state, commander.plan(state));
    }

    expect(state.result).toBe("won");
    expect(state.unitsProducedByRole.tank).toBeGreaterThanOrEqual(1);
    expect(commander.getMetrics().commandsByType.produce).toBeGreaterThan(0);
  });

  it("repairs a damaged command HQ without toggling an active repair", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "forceQuota", role: "infantry", target: 1 } });
    const yard = addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    yard.hp = yard.maxHp - 200;
    const initialHp = yard.hp;
    const commander = new CompetentCommander();

    const first = commander.plan(state);
    expect(first).toContainEqual({ type: "repair", buildingId: yard.id });
    const result = tick(state, first);
    expect(result.events).not.toContainEqual(expect.objectContaining({ type: "commandRejected" }));
    expect(yard.repairing).toBe(true);
    expect(yard.hp).toBeGreaterThan(initialHp);

    state.tick = 24;
    expect(commander.plan(state)).not.toContainEqual({ type: "repair", buildingId: yard.id });
  });

  it("keeps two identical missions and commander plans deterministic", () => {
    const a = createMission({ seed: 421, missionIndex: 0 });
    const b = createMission({ seed: 421, missionIndex: 0 });
    const commanderA = new CompetentCommander();
    const commanderB = new CompetentCommander();

    for (let i = 0; i < 720 && a.result === "playing"; i++) {
      const ordersA = commanderA.plan(a);
      const ordersB = commanderB.plan(b);
      expect(ordersA).toEqual(ordersB);
      tick(a, ordersA);
      tick(b, ordersB);
    }

    expect(inspect(a)).toEqual(inspect(b));
    expect(commanderA.getMetrics()).toEqual(commanderB.getMetrics());
  });

  it("gives the first offensive mission enough infrastructure to stage an assault", () => {
    const state = createMission({ seed: 1, missionIndex: 2 });
    const player = state.entities.filter((entity) => entity.owner === 0);

    expect(player.some((entity) => entity.class === "building" && entity.kind === "factory")).toBe(true);
    expect(player.some((entity) => entity.class === "building" && entity.kind === "turret")).toBe(true);
    expect(player.some((entity) => entity.class === "unit" && entity.kind === "antiArmor")).toBe(true);
    expect(player.some((entity) => entity.class === "unit" && entity.kind === "tank")).toBe(true);
  });

  it("issues useful macro orders across every generated mission kind", () => {
    const campaign = createCampaign(0);
    for (const mission of campaign.missions) {
      const state = createMission({ seed: 0, missionIndex: mission.index });
      const commander = new CompetentCommander();
      let rejections = 0;
      for (let i = 0; i < 240 && state.result === "playing"; i++) {
        const result = tick(state, commander.plan(state));
        rejections += result.events.filter((event) => event.type === "commandRejected").length;
      }
      expect(commander.getMetrics().commands).toBeGreaterThan(0);
      expect(rejections).toBe(0);
    }
  });

  it("does not retry an impossible single-instance building for a structure quota", () => {
    const state = createMission({ seed: 26, missionIndex: 2 });
    const commander = new CompetentCommander();
    let rejections = 0;

    for (let i = 0; i < 4_000 && state.result === "playing"; i++) {
      const result = tick(state, commander.plan(state));
      rejections += result.events.filter((event) => event.type === "commandRejected").length;
    }

    expect(state.missionKind).toBe("structureQuota");
    expect(rejections).toBe(0);
  });

  it("reserves credits for an unnamed structure quota once the army is ready", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "structureQuota", target: 2 } });
    addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    addBuilding(state, 0, "barracks", 2, 6);
    state.buildingsCompletedByKind.power = 1;
    state.buildingsCompletedByKind.turret = 1;
    for (let i = 0; i < 18; i++) addUnit(state, 0, "infantry", 8 + (i % 6), 8 + Math.floor(i / 6));
    state.credits[0] = BUILDING_STATS.refinery.cost - 1;

    expect(planProduction(state)).toEqual([]);

    state.credits[0] = BUILDING_STATS.refinery.cost;
    expect(planProduction(state)).toContainEqual(expect.objectContaining({ type: "produce" }));
  });

  it("keeps a committed assault focused on its objective until it wins", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "sabotage", targetCount: 1, ticks: 5000 } });
    addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    addBuilding(state, 0, "barracks", 2, 5);
    const attackers = Array.from({ length: 8 }, (_, index) => addUnit(state, 0, index % 2 ? "antiArmor" : "infantry", 5 + (index % 4), 6 + Math.floor(index / 4)));
    addBuilding(state, 1, "constructionYard", 18, 18);
    const marked = addBuilding(state, 1, "objective", 12, 12, 0, true);
    marked.hp = 30;
    state.win.targetIds = [marked.id];
    state.runtime = { kind: "sabotage", phase: "active", targetIds: [marked.id], rescued: 0, required: 1, secondary: [] };
    const commander = new CompetentCommander();

    createScenarioRunner(state).run({ maxTicks: 1200, commandsForTick: () => commander.plan(state) });

    expect(attackers.some((attacker) => attacker.hp > 0)).toBe(true);
    expect(state.result).toBe("won");
  });

  it("commits an undersized offensive force during the final push", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "sabotage", targetCount: 1, ticks: 5000 } });
    addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    const attacker = addUnit(state, 0, "infantry", 5, 5);
    addBuilding(state, 1, "constructionYard", 18, 18);
    const marked = addBuilding(state, 1, "objective", 12, 12, 0, true);
    state.win.targetIds = [marked.id];
    state.runtime = {
      kind: "sabotage",
      phase: "active",
      targetIds: [marked.id],
      deadline: 100,
      rescued: 0,
      required: 1,
      secondary: [],
    };
    state.tick = 72;

    const commands = new CompetentCommander().plan(state);

    expect(commands).toContainEqual(expect.objectContaining({
      type: "attackMove",
      unitIds: [attacker.id],
      x: marked.x,
      y: marked.y,
    }));
  });

  it("keeps a final-push assault moving while one defender answers a threat", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "sabotage", targetCount: 1, ticks: 5000 } });
    addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    const attackers = [
      addUnit(state, 0, "infantry", 5, 5),
      addUnit(state, 0, "antiArmor", 6, 5),
      addUnit(state, 0, "infantry", 5, 6),
    ];
    addBuilding(state, 1, "constructionYard", 18, 18);
    const marked = addBuilding(state, 1, "objective", 12, 12, 0, true);
    const threat = addUnit(state, 1, "infantry", 7, 2);
    state.win.targetIds = [marked.id];
    state.runtime = {
      kind: "sabotage",
      phase: "active",
      targetIds: [marked.id],
      deadline: 100,
      rescued: 0,
      required: 1,
      secondary: [],
    };
    state.tick = 72;

    const commands = new CompetentCommander().plan(state);

    expect(commands).toContainEqual({ type: "attack", unitIds: [attackers[0]!.id], targetId: threat.id });
    expect(commands).toContainEqual(expect.objectContaining({
      type: "attackMove",
      unitIds: expect.arrayContaining([attackers[1]!.id, attackers[2]!.id]),
      x: marked.x,
      y: marked.y,
    }));
  });

  it("moves a rescue force toward neutral scenario targets", () => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "rescue", targetCount: 1, ticks: 5000 } });
    state.missionIndex = 2;
    const yard = addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    addBuilding(state, 0, "barracks", 2, 5);
    const infantry = addUnit(state, 0, "infantry", 4, 4);
    const target = addUnit(state, 0, "infantry", 8, 8);
    target.neutral = true;
    target.scenarioRole = "stranded";
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [target.id],
      zone: { x: yard.x, y: yard.y },
      rescued: 0,
      required: 1,
      secondary: [],
    };
    const commander = new CompetentCommander();
    const orders = commander.plan(state);

    expect(orders).toContainEqual(expect.objectContaining({ type: "move", unitIds: [infantry.id], x: target.x, y: target.y }));
  });

  it("keeps a minority home guard at the yard during a rescue operation", () => {
    const state = makeFixture({ width: 28, height: 28, win: { kind: "rescue", targetCount: 1, ticks: 5000 } });
    state.missionIndex = 4;
    const yard = addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    addBuilding(state, 0, "barracks", 2, 5);
    addBuilding(state, 0, "factory", 2, 8);
    const combat = Array.from({ length: 5 }, (_, index) => addUnit(state, 0, "infantry", 5 + index, 5));
    const target = addUnit(state, 0, "infantry", 20, 20);
    target.neutral = true;
    target.scenarioRole = "stranded";
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [target.id],
      zone: { x: yard.x, y: yard.y },
      rescued: 0,
      required: 1,
      secondary: [],
    };

    const orders = new CompetentCommander().plan(state);
    const guard = orders.find((order) => order.type === "move" && order.x === yard.x && order.y === yard.y);
    const rescue = orders.find((order) => order.type === "move" && order.x === target.x && order.y === target.y);

    expect(guard && "unitIds" in guard ? guard.unitIds : []).toHaveLength(2);
    expect(rescue && "unitIds" in rescue ? rescue.unitIds : []).toHaveLength(combat.length - 2);
  });

  it("keeps the rescue team walking to stranded units when the yard is raided", () => {
    const state = makeFixture({ width: 28, height: 28, win: { kind: "rescue", targetCount: 1, ticks: 5000 } });
    state.missionIndex = 4;
    const yard = addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    addBuilding(state, 0, "barracks", 2, 5);
    addBuilding(state, 0, "factory", 2, 8);
    const combat = Array.from({ length: 5 }, (_, index) => addUnit(state, 0, "infantry", 5 + index, 5));
    const target = addUnit(state, 0, "infantry", 20, 20);
    target.neutral = true;
    target.scenarioRole = "stranded";
    const threat = addUnit(state, 1, "infantry", 4, 4);
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [target.id],
      zone: { x: yard.x, y: yard.y },
      rescued: 0,
      required: 1,
      secondary: [],
    };

    const orders = new CompetentCommander().plan(state);
    const guard = orders.find((order) => order.type === "attack" && order.targetId === threat.id);
    const rescue = orders.find((order) => order.type === "move" && order.x === target.x && order.y === target.y);
    const guardIds = guard && "unitIds" in guard ? guard.unitIds : [];
    const rescueIds = rescue && "unitIds" in rescue ? rescue.unitIds : [];

    expect(guardIds).toHaveLength(2);
    expect(rescueIds).toHaveLength(combat.length - 2);
    expect(new Set([...guardIds, ...rescueIds])).toHaveLength(combat.length);
  });

  it.each(["rescue", "holdTheLine"] as const)("prioritizes an early defensive turret for %s missions", (kind) => {
    const win = kind === "rescue"
      ? { kind, targetCount: 1, ticks: 5000 }
      : { kind, ticks: 5000 };
    const state = makeFixture({ width: 24, height: 24, win });
    state.missionIndex = 0;
    const yard = addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    addBuilding(state, 0, "barracks", 2, 5);

    expect(planBuilding(state, yard)).toMatchObject({ type: "build", building: "turret" });
  });

  it.each(["rescue", "extraction"] as const)("does not spend the opening on a factory during %s", (kind) => {
    const state = makeFixture({ width: 24, height: 24, win: { kind, targetCount: 1, ticks: 5000 } });
    state.missionIndex = 2;
    const yard = addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    addBuilding(state, 0, "barracks", 2, 5);
    addBuilding(state, 0, "turret", 8, 2);

    expect(planBuilding(state, yard)).toBeUndefined();
  });

  it("stages a late-game decapitation strike after the opening settle", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "decapitate", ticks: 5000 } });
    state.missionIndex = 4;
    addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    const attackers = Array.from({ length: 10 }, (_, index) => addUnit(state, 0, "infantry", 5 + (index % 5), 6 + Math.floor(index / 5)));
    const enemyYard = addBuilding(state, 1, "constructionYard", 18, 18);

    expect(assaultReady(state, enemyYard, attackers)).toBe(false);

    state.tick = 2400;
    expect(assaultReady(state, enemyYard, attackers)).toBe(true);

    const orders = new CompetentCommander().plan(state);
    const strike = orders.find((order) => order.type === "attackMove" && order.x === enemyYard.x && order.y === enemyYard.y);

    expect(strike).toBeDefined();
    expect(strike && "unitIds" in strike ? strike.unitIds.length : 0).toBeGreaterThan(0);
  });

  it("lets a late-game closeout commit an understrength decapitation force", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "decapitate", ticks: 5000 } });
    state.missionIndex = 4;
    const attackers = Array.from({ length: 4 }, (_, index) => addUnit(state, 0, "infantry", 5 + index, 6));
    const enemyYard = addBuilding(state, 1, "constructionYard", 18, 18);

    expect(assaultReady(state, enemyYard, attackers)).toBe(false);
    state.tick = 2399;
    expect(assaultReady(state, enemyYard, attackers)).toBe(false);
    state.tick = 2400;
    expect(assaultReady(state, enemyYard, attackers)).toBe(true);
  });

  it("aims a decapitation strike at the enemy construction yard", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "decapitate", ticks: 5000 } });
    state.missionIndex = 2;
    addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    Array.from({ length: 10 }, (_, index) => addUnit(state, 0, "infantry", 5 + (index % 5), 6 + Math.floor(index / 5)));
    const enemyYard = addBuilding(state, 1, "constructionYard", 18, 18);
    addBuilding(state, 1, "turret", 16, 16, 0, true);

    const orders = new CompetentCommander().plan(state);
    const strike = orders.find((order) => order.type === "attackMove" && order.x === enemyYard.x && order.y === enemyYard.y);
    const turretStrike = orders.find((order) => order.type === "attackMove" && order.x === 16 && order.y === 16);

    expect(strike).toBeDefined();
    expect(turretStrike).toBeUndefined();
  });

  it("fires on the enemy construction yard once a decapitation force is in range", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "decapitate", ticks: 5000 } });
    state.missionIndex = 2;
    addBuilding(state, 0, "constructionYard", 2, 2);
    const enemyYard = addBuilding(state, 1, "constructionYard", 18, 18);
    Array.from({ length: 10 }, (_, index) => addUnit(state, 0, "infantry", 17 + (index % 5), 17 + Math.floor(index / 5)));

    const orders = new CompetentCommander().plan(state);
    const fire = orders.find((order) => order.type === "attack" && order.targetId === enemyYard.id);

    expect(fire).toBeDefined();
    expect(fire && "unitIds" in fire ? fire.unitIds.length : 0).toBeGreaterThan(0);
  });

  it("keeps a committed decapitation assault moving when a scout reaches HQ", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "decapitate", ticks: 5000 } });
    state.missionIndex = 2;
    addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    Array.from({ length: 10 }, (_, index) => addUnit(state, 0, "infantry", 5 + (index % 5), 6 + Math.floor(index / 5)));
    const enemyYard = addBuilding(state, 1, "constructionYard", 18, 18);
    const commander = new CompetentCommander();

    expect(commander.plan(state).some((order) => order.type === "attackMove" && order.x === enemyYard.x && order.y === enemyYard.y)).toBe(true);

    addUnit(state, 1, "infantry", 4, 2);
    state.tick = 24;
    const orders = commander.plan(state);
    const strike = orders.find((order) => order.type === "attackMove" && order.x === enemyYard.x && order.y === enemyYard.y);
    const intercept = orders.find((order) => order.type === "attack");

    expect(strike).toBeDefined();
    expect(intercept).toBeDefined();
    expect(strike && "unitIds" in strike ? strike.unitIds.length : 0).toBeGreaterThan(0);
  });

  it("keeps the exact hold-the-line reinforcement curve", () => {
    expect(Array.from({ length: 8 }, (_, index) => missionDifficulty(index).holdLineReinforcements)).toEqual([1, 2, 2, 3, 3, 3, 4, 3]);
  });

  it("keeps contacted extraction cargo on its return route", () => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "extraction", targetCount: 1, ticks: 5000 } });
    state.missionIndex = 2;
    const yard = addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    const escort = addUnit(state, 0, "infantry", 6, 6);
    const cargo = addUnit(state, 0, "infantry", 10, 10);
    cargo.scenarioRole = "cargo";
    const targetId = cargo.id;
    state.runtime = {
      kind: "extraction",
      phase: "extraction",
      targetIds: [targetId],
      zone: { x: yard.x, y: yard.y },
      rescued: 0,
      required: 1,
      secondary: [],
    };

    const orders = new CompetentCommander().plan(state);
    const cargoOrders = orders.filter((order) => "unitIds" in order && order.unitIds.includes(cargo.id));

    expect(cargoOrders).toHaveLength(1);
    expect(cargoOrders[0]).toMatchObject({ type: "move", unitIds: [cargo.id], x: yard.x, y: yard.y });
    expect(orders).toContainEqual(expect.objectContaining({ type: "attackMove", unitIds: [escort.id], x: yard.x, y: yard.y }));
  });

  it("stages a small assault force instead of sending it into a marked base", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "sabotage", targetCount: 1, ticks: 5000 } });
    const yard = addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    addBuilding(state, 0, "barracks", 2, 5);
    addUnit(state, 0, "infantry", 4, 4);
    addBuilding(state, 1, "constructionYard", 18, 18);
    const marked = addBuilding(state, 1, "objective", 14, 14, 0, true);
    state.win.targetIds = [marked.id];
    const commander = new CompetentCommander();

    const orders = commander.plan(state);

    expect(orders).toContainEqual(expect.objectContaining({ type: "move", x: yard.x, y: yard.y }));
    expect(orders.some((order) => order.type === "attack")).toBe(false);
  });

  it("commits a ready offensive force while leaving a home guard", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "sabotage", targetCount: 1, ticks: 5000 } });
    state.missionIndex = 2;
    const yard = addBuilding(state, 0, "constructionYard", 2, 2);
    addBuilding(state, 0, "power", 5, 2);
    const attackers = Array.from({ length: 8 }, (_, index) => addUnit(state, 0, index % 2 ? "antiArmor" : "infantry", 5 + (index % 4), 6 + Math.floor(index / 4)));
    addBuilding(state, 1, "constructionYard", 18, 18);
    const marked = addBuilding(state, 1, "objective", 14, 14, 0, true);
    state.win.targetIds = [marked.id];

    const orders = new CompetentCommander().plan(state);
    const attack = orders.find((order) => order.type === "attackMove" && order.x === marked.x && order.y === marked.y);
    const guarded = orders.find((order) => order.type === "move" && order.x === yard.x && order.y === yard.y);

    expect(attack).toBeDefined();
    expect(attack && "unitIds" in attack ? attack.unitIds.length : 0).toBeGreaterThan(0);
    expect(attack && "unitIds" in attack ? attack.unitIds.length : 0).toBeLessThan(attackers.length);
    expect(guarded).toBeDefined();
  });
});

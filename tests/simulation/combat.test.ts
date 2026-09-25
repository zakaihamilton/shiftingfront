import { describe, expect, it } from "vitest";
import { issue, tick } from "../../lib/sim/api";
import { tickCombat } from "../../lib/sim/combat";
import { createPendingAlerts, flushPlayerAlerts } from "../../lib/sim/combat/alerts";
import { buildGrid } from "../../lib/sim/combat/grid";
import { addBuilding, addUnit, makeFixture, setHeight } from "../../lib/sim/fixtures";
import type { SimEvent } from "../../lib/types";

describe("combat targeting", () => {
  it("prefers a combat unit over a closer passive building", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 0, "infantry", 4, 4);
    const power = addBuilding(s, 1, "power", 5, 4);
    const foe = addUnit(s, 1, "infantry", 8, 4);
    tickCombat(s);
    expect(attacker.attackTarget).toBe(foe.id);
    expect(attacker.attackTarget).not.toBe(power.id);
  });

  it("prefers a turret over a closer passive building", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 0, "tank", 4, 4);
    addBuilding(s, 1, "refinery", 5, 4);
    const turret = addBuilding(s, 1, "turret", 9, 4);
    tickCombat(s);
    expect(attacker.attackTarget).toBe(turret.id);
  });

  it("falls back to a passive building when no threats are in reach", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 0, "infantry", 4, 4);
    const power = addBuilding(s, 1, "power", 5, 4);
    tickCombat(s);
    expect(attacker.attackTarget).toBe(power.id);
  });

  it("switches from a passive building to an attacking unit", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 0, "tank", 4, 4);
    const power = addBuilding(s, 1, "power", 5, 4);
    attacker.attackTarget = power.id;
    const foe = addUnit(s, 1, "antiArmor", 7, 4);
    tickCombat(s);
    expect(attacker.attackTarget).toBe(foe.id);
  });

  it("does not treat harvesters as attacking units", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 0, "infantry", 4, 4);
    addUnit(s, 1, "harvester", 5, 4);
    const foe = addUnit(s, 1, "tank", 8, 4);
    tickCombat(s);
    expect(attacker.attackTarget).toBe(foe.id);
  });

  it("stops walking to shoot a unit in weapon range", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 1, "tank", 4, 4);
    const yard = addBuilding(s, 0, "constructionYard", 14, 4);
    attacker.attackTarget = yard.id;
    attacker.path = [
      { x: 5, y: 4 },
      { x: 6, y: 4 },
      { x: 7, y: 4 },
    ];
    const foe = addUnit(s, 0, "infantry", 5, 4);
    const hp = foe.hp;
    tickCombat(s);
    expect(attacker.attackTarget).toBe(foe.id);
    expect(attacker.path).toEqual([]);
    expect(foe.hp).toBeLessThan(hp);
  });

  it("emits immutable weapon and position data for battlefield audio", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 0, "tank", 4, 4);
    const foe = addUnit(s, 1, "infantry", 5, 4);
    const events = tickCombat(s);
    const combat = events.find((event) => event.type === "combat");

    expect(combat).toMatchObject({
      type: "combat",
      owner: 0,
      attackerKind: "tank",
      weapon: "cannon",
      x: attacker.x,
      y: attacker.y,
      targetX: foe.x,
      targetY: foe.y,
      targetOwner: 1,
      targetKind: "infantry",
    });
  });

  it("does not let a turret fire until construction finishes", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const turret = addBuilding(s, 0, "turret", 4, 4, 12);
    const foe = addUnit(s, 1, "infantry", 6, 4);
    const hp = foe.hp;
    tickCombat(s);
    expect(foe.hp).toBe(hp);
    expect(turret.attackTarget).toBeUndefined();

    turret.constructing = 0;
    tickCombat(s);
    expect(foe.hp).toBeLessThan(hp);
    expect(turret.attackTarget).toBe(foe.id);
  });

  it("does not target a unit destroyed earlier in the same combat tick", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    addUnit(s, 0, "infantry", 4, 4);
    addUnit(s, 0, "infantry", 4, 5);
    const foe = addUnit(s, 1, "infantry", 5, 4);
    foe.hp = 1;

    const events = tickCombat(s);

    expect(events.filter((event) => event.type === "destroyed")).toHaveLength(1);
    expect(s.losses.units).toEqual([0, 1]);
  });

  it("records each destroyed unit and structure as one loss for its owner", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const tank = addUnit(s, 0, "tank", 4, 4);
    const unit = addUnit(s, 1, "infantry", 5, 4);
    unit.hp = 1;
    tickCombat(s);
    expect(s.losses.units).toEqual([0, 1]);
    tickCombat(s);
    expect(s.losses.units).toEqual([0, 1]);

    tank.cooldown = 0;
    const structure = addBuilding(s, 1, "power", 5, 4);
    structure.hp = 1;
    tickCombat(s);
    expect(s.losses.buildings).toEqual([0, 1]);
  });

  it("records splash-destroyed units and structures as losses", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    addUnit(s, 0, "tank", 4, 4);
    const primary = addUnit(s, 1, "infantry", 5, 4);
    const splashStructure = addBuilding(s, 1, "power", 5.8, 4);
    primary.hp = 1;
    splashStructure.hp = 1;

    const events = tickCombat(s);

    expect(events.filter((event) => event.type === "destroyed")).toHaveLength(2);
    expect(s.losses.units).toEqual([0, 1]);
    expect(s.losses.buildings).toEqual([0, 1]);
  });

  it("keeps a move order instead of chasing a spotted enemy", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 0, "infantry", 4, 4);
    addUnit(s, 1, "infantry", 8, 4);
    issue(s, { type: "move", unitIds: [attacker.id], x: 14, y: 4 });
    const dest = attacker.path[attacker.path.length - 1];
    tickCombat(s);
    expect(attacker.path.length).toBeGreaterThan(0);
    expect(attacker.path[attacker.path.length - 1]).toEqual(dest);
    expect(attacker.attackTarget).toBeUndefined();
    expect(attacker.idle).toBe(false);
  });

  it("attack-move fires at an in-range threat without abandoning the route", () => {
    const s = makeFixture({ width: 20, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 0, "infantry", 4, 4);
    const foe = addUnit(s, 1, "infantry", 6, 4);
    issue(s, { type: "attackMove", unitIds: [attacker.id], x: 15, y: 4 });
    const destination = attacker.path.at(-1);
    const hp = foe.hp;

    tickCombat(s);

    expect(attacker.orderMode).toBe("attackMove");
    expect(attacker.attackTarget).toBeUndefined();
    expect(attacker.path.at(-1)).toEqual(destination);
    expect(foe.hp).toBeLessThan(hp);
  });

  it("attack-move does not chase a visible threat that is outside weapon range", () => {
    const s = makeFixture({ width: 20, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 0, "infantry", 4, 4);
    const foe = addUnit(s, 1, "infantry", 8, 4);
    issue(s, { type: "attackMove", unitIds: [attacker.id], x: 15, y: 4 });
    const destination = attacker.path.at(-1);
    const hp = foe.hp;

    tickCombat(s);

    expect(attacker.orderMode).toBe("attackMove");
    expect(attacker.attackTarget).toBeUndefined();
    expect(attacker.path.length).toBeGreaterThan(0);
    expect(attacker.path.at(-1)).toEqual(destination);
    expect(foe.hp).toBe(hp);
  });

  it("keeps moving toward the destination while firing at a surviving threat", () => {
    const s = makeFixture({ width: 24, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 0, "tank", 4, 4);
    const foe = addUnit(s, 1, "harvester", 6, 4);
    const initialX = attacker.x;

    tick(s, [{ type: "attackMove", unitIds: [attacker.id], x: 15, y: 4 }]);
    for (let i = 0; i < 20; i++) tick(s);

    expect(attacker.x).toBeGreaterThan(initialX);
    expect(attacker.orderDestination).toEqual({ x: 15, y: 4 });
    expect(attacker.attackTarget).toBeUndefined();
    expect(foe.hp).toBeLessThan(foe.maxHp);
  });

  it("keeps walking through a unit already in weapon range", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 0, "tank", 4, 4);
    const foe = addUnit(s, 1, "infantry", 5, 4);
    const hp = foe.hp;
    issue(s, { type: "move", unitIds: [attacker.id], x: 14, y: 4 });
    const dest = attacker.path[attacker.path.length - 1];
    tickCombat(s);
    expect(attacker.path[attacker.path.length - 1]).toEqual(dest);
    expect(foe.hp).toBeLessThan(hp);
  });

  it("keeps an attack order on the commanded target instead of switching", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 0, "tank", 4, 4);
    const power = addBuilding(s, 1, "power", 12, 4);
    addUnit(s, 1, "infantry", 5, 4);
    issue(s, { type: "attack", unitIds: [attacker.id], targetId: power.id });
    tickCombat(s);
    expect(attacker.attackTarget).toBe(power.id);
    expect(attacker.path.length).toBeGreaterThan(0);
    expect(attacker.idle).toBe(false);
  });

  it("lets an enemy raid stop to shoot a turret on the way to the yard", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const raider = addUnit(s, 1, "tank", 4, 4);
    const yard = addBuilding(s, 0, "constructionYard", 14, 4);
    const turret = addBuilding(s, 0, "turret", 6, 4);
    raider.attackTarget = yard.id;
    raider.idle = false;
    raider.path = [
      { x: 5, y: 4 },
      { x: 6, y: 4 },
      { x: 7, y: 4 },
    ];
    const hp = turret.hp;
    tickCombat(s);
    expect(raider.attackTarget).toBe(turret.id);
    expect(raider.path).toEqual([]);
    expect(turret.hp).toBeLessThan(hp);
  });

  it("lets an enemy raid stop to shoot a combat unit on the way to a harvester", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const raider = addUnit(s, 1, "tank", 4, 4);
    const harvester = addUnit(s, 0, "harvester", 14, 4);
    const guard = addUnit(s, 0, "infantry", 5, 4);
    raider.attackTarget = harvester.id;
    raider.idle = false;
    raider.path = [
      { x: 5, y: 4 },
      { x: 6, y: 4 },
      { x: 7, y: 4 },
    ];
    const hp = guard.hp;
    tickCombat(s);
    expect(raider.attackTarget).toBe(guard.id);
    expect(raider.path).toEqual([]);
    expect(guard.hp).toBeLessThan(hp);
  });

  it("lets a defending unit fire in range without chasing", () => {
    const close = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const defender = addUnit(close, 0, "infantry", 4, 4);
    defender.stance = "defensive";
    const near = addUnit(close, 1, "infantry", 5, 4);
    const hp = near.hp;
    tickCombat(close);
    expect(defender.attackTarget).toBe(near.id);
    expect(near.hp).toBeLessThan(hp);
    expect(defender.path).toEqual([]);

    const hunt = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const sentry = addUnit(hunt, 0, "infantry", 4, 4);
    sentry.stance = "defensive";
    const far = addUnit(hunt, 1, "tank", 10, 4);
    tickCombat(hunt);
    expect(sentry.attackTarget).toBeUndefined();
    expect(sentry.path).toEqual([]);
    expect(far.hp).toBe(far.maxHp);
  });

  it("does not auto-acquire when holding ground", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const holder = addUnit(s, 0, "infantry", 4, 4);
    holder.stance = "hold";
    const foe = addUnit(s, 1, "infantry", 5, 4);
    const hp = foe.hp;
    tickCombat(s);
    expect(holder.attackTarget).toBeUndefined();
    expect(holder.path).toEqual([]);
    expect(foe.hp).toBe(hp);
  });

  it("does not reacquire a contacted rescue evacuee", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "rescue", targetCount: 1, ticks: 500 } });
    const stranded = addUnit(s, 0, "infantry", 4, 4);
    stranded.neutral = false;
    stranded.scenarioRole = "stranded";
    const raider = addUnit(s, 1, "tank", 5, 4);
    s.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [stranded.id],
      rescued: 0,
      required: 1,
      secondary: [],
    };

    const hp = stranded.hp;
    tickCombat(s);

    expect(raider.attackTarget).toBeUndefined();
    expect(stranded.hp).toBe(hp);
  });
});

describe("combat damage model", () => {
  function strikeDamage(kind: "infantry" | "antiArmor" | "tank", target: "infantry" | "tank" | "power", seed = 7) {
    const s = makeFixture({ seed, width: 16, height: 12, win: { kind: "annihilate" } });
    addUnit(s, 0, kind, 4, 4);
    const foe = target === "power" ? addBuilding(s, 1, "power", 5, 4) : addUnit(s, 1, target, 5, 4);
    const hp = foe.hp;
    tickCombat(s);
    return hp - foe.hp;
  }

  it("applies smallArms poorly against heavy armor and structures", () => {
    const vsLight = strikeDamage("infantry", "infantry");
    const vsHeavy = strikeDamage("infantry", "tank");
    const vsStructure = strikeDamage("infantry", "power");
    expect(vsLight).toBeGreaterThanOrEqual(4.25);
    expect(vsLight).toBeLessThanOrEqual(5.75);
    expect(vsHeavy).toBeGreaterThanOrEqual(1.91);
    expect(vsHeavy).toBeLessThanOrEqual(2.59);
    expect(vsStructure).toBeGreaterThanOrEqual(0.85);
    expect(vsStructure).toBeLessThanOrEqual(1.15);
    expect(vsLight).toBeGreaterThan(vsHeavy);
    expect(vsHeavy).toBeGreaterThan(vsStructure);
  });

  it("applies antiArmor best against heavy armor", () => {
    const vsHeavy = strikeDamage("antiArmor", "tank");
    const vsLight = strikeDamage("antiArmor", "infantry");
    const vsStructure = strikeDamage("antiArmor", "power");
    expect(vsHeavy).toBeGreaterThanOrEqual(11.47);
    expect(vsHeavy).toBeLessThanOrEqual(15.53);
    expect(vsLight).toBeGreaterThanOrEqual(7.65);
    expect(vsLight).toBeLessThanOrEqual(10.35);
    expect(vsStructure).toBeGreaterThanOrEqual(8.07);
    expect(vsStructure).toBeLessThanOrEqual(10.93);
    expect(vsHeavy).toBeGreaterThan(vsLight);
    expect(vsHeavy).toBeGreaterThan(vsStructure);
  });

  it("applies cannon splash to a neighbor of the primary target", () => {
    const s = makeFixture({ seed: 7, width: 16, height: 12, win: { kind: "annihilate" } });
    addUnit(s, 0, "tank", 4, 4);
    const primary = addUnit(s, 1, "infantry", 5, 4);
    const splash = addUnit(s, 1, "infantry", 5, 5);
    const primaryHp = primary.hp;
    const splashHp = splash.hp;
    tickCombat(s);
    expect(primary.hp).toBeLessThan(primaryHp);
    expect(splash.hp).toBeLessThan(splashHp);
    expect(primaryHp - primary.hp).toBeGreaterThan(splashHp - splash.hp);
  });

  it("emits one destruction event when cannon splash kills a collateral target", () => {
    const s = makeFixture({ seed: 7, width: 16, height: 12, win: { kind: "annihilate" } });
    addUnit(s, 0, "tank", 4, 4);
    addUnit(s, 1, "infantry", 5, 4);
    const splash = addUnit(s, 1, "infantry", 5, 5);
    splash.hp = 1;

    const events = tickCombat(s);
    const destroyed = events.filter((event) => event.type === "destroyed");

    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toMatchObject({
      id: splash.id,
      owner: splash.owner,
      kind: splash.kind,
      x: splash.x,
      y: splash.y,
    });
    expect(splash.hp).toBe(0);
  });

  it("deals more damage from high ground than from low ground", () => {
    const high = makeFixture({ seed: 7, width: 16, height: 12, win: { kind: "annihilate" } });
    setHeight(high, 4, 4, 2);
    addUnit(high, 0, "infantry", 4, 4);
    const highFoe = addUnit(high, 1, "infantry", 5, 4);
    const highHp = highFoe.hp;
    tickCombat(high);

    const low = makeFixture({ seed: 7, width: 16, height: 12, win: { kind: "annihilate" } });
    setHeight(low, 5, 4, 2);
    addUnit(low, 0, "infantry", 4, 4);
    const lowFoe = addUnit(low, 1, "infantry", 5, 4);
    const lowHp = lowFoe.hp;
    tickCombat(low);

    expect(highHp - highFoe.hp).toBeGreaterThan(lowHp - lowFoe.hp);
  });

  it("uses the high-ground range bonus for defensive target acquisition", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 0, "infantry", 4, 4);
    attacker.stance = "defensive";
    setHeight(s, 4, 4, 2);
    const target = addUnit(s, 1, "infantry", 7, 4);
    const hp = target.hp;

    tickCombat(s);

    expect(attacker.attackTarget).toBe(target.id);
    expect(target.hp).toBeLessThan(hp);
  });

  it("flanks an ordered target when a height ridge blocks the firing line", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 0, "tank", 4, 4);
    const target = addUnit(s, 1, "infantry", 6, 4);
    setHeight(s, 5, 4, 4);
    attacker.attackTarget = target.id;
    attacker.orderMode = "attack";
    attacker.idle = false;

    const hp = target.hp;
    tickCombat(s);

    expect(target.hp).toBe(hp);
    expect(attacker.path.length).toBeGreaterThan(0);
  });

  it("applies suppression on a combat hit", () => {
    const s = makeFixture({ seed: 7, width: 16, height: 12, win: { kind: "annihilate" } });
    addUnit(s, 0, "infantry", 4, 4);
    const foe = addUnit(s, 1, "infantry", 5, 4);
    tickCombat(s);
    expect(foe.suppression).toBeGreaterThan(0);
  });
});

describe("combat alerts", () => {
  it("emits a contact alert when an enemy strikes a player harvester", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    addUnit(s, 0, "harvester", 5, 4);
    addUnit(s, 1, "infantry", 4, 4);

    expect(tickCombat(s)).toContainEqual({ type: "alert", kind: "contact", text: "Harvester under attack" });
  });

  it("emits a warning when an enemy strikes the player construction yard", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 5, 4);
    addUnit(s, 1, "infantry", 4, 4);

    expect(tickCombat(s)).toContainEqual({
      type: "alert",
      kind: "warning",
      text: "Command HQ under attack",
    });
  });

  it("mutes a second harvester strike inside the mute window", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    addUnit(s, 0, "harvester", 5, 4);
    const attacker = addUnit(s, 1, "infantry", 4, 4);

    expect(tickCombat(s).filter((event) => event.type === "alert")).toHaveLength(1);
    attacker.cooldown = 0;
    expect(tickCombat(s).filter((event) => event.type === "alert")).toHaveLength(0);
  });

  it("emits a contact alert when an enemy strikes a generic player unit", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    addUnit(s, 0, "tank", 5, 4);
    addUnit(s, 1, "infantry", 4, 4);

    expect(tickCombat(s)).toContainEqual({ type: "alert", kind: "contact", text: "Unit under attack" });
  });

  it("emits a contact alert when an enemy strikes a non-yard building", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "power", 5, 4);
    addUnit(s, 1, "infantry", 4, 4);

    expect(tickCombat(s)).toContainEqual({ type: "alert", kind: "contact", text: "Base under attack" });
  });

  it("keeps the construction-yard warning when infantry is also hit", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const pending = createPendingAlerts();
    pending.yard = true;
    pending.unit = true;
    pending.building = true;
    const events: SimEvent[] = [];
    flushPlayerAlerts(s, pending, events);
    expect(events).toEqual([{ type: "alert", kind: "warning", text: "Command HQ under attack" }]);
  });

  it("does not let a unit that died earlier in the pass fire", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const tank = addUnit(s, 0, "tank", 4, 4);
    const foe = addUnit(s, 1, "infantry", 5, 4);
    foe.hp = 1;
    const tankHp = tank.hp;
    tickCombat(s);
    expect(foe.hp).toBe(0);
    expect(tank.hp).toBe(tankHp);
  });

  it("does not mark a pending travel order idle or replace it with a chase", () => {
    const s = makeFixture({ width: 24, height: 12, win: { kind: "annihilate" } });
    const mover = addUnit(s, 0, "infantry", 2, 2);
    mover.idle = false;
    mover.orderMode = "move";
    mover.orderDestination = { x: 20, y: 2 };
    mover.path = [];
    mover.routePending = true;
    addUnit(s, 1, "infantry", 4, 2);
    tickCombat(s);
    expect(mover.idle).toBe(false);
    expect(mover.routePending).toBe(true);
    expect(mover.path).toEqual([]);
    expect(mover.orderDestination).toEqual({ x: 20, y: 2 });
  });

  it("clears cached combat grid buffers when entities are destroyed or removed", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const foe = addUnit(s, 1, "infantry", 4, 4);
    const foeId = foe.id;

    const grid1 = buildGrid(s);
    expect(grid1.byId[foeId]).toBe(foe);
    expect(grid1.targetable[foeId]).toBe(1);
    expect(grid1.threat[foeId]).toBe(1);

    // Destroy foe and rebuild grid
    foe.hp = 0;
    const grid2 = buildGrid(s);
    expect(grid2.byId[foeId]).toBeUndefined();
    expect(grid2.targetable[foeId]).toBe(0);
    expect(grid2.threat[foeId]).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  tryBuildForwardInfrastructure,
  tryBuildPower,
  tryBuildTurret,
} from "../../lib/sim/ai/building";
import { addBuilding, makeFixture } from "../../lib/sim/fixtures";
import { living } from "../../lib/sim/world";

function enemyState() {
  const s = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
  s.credits[1] = 50_000;
  addBuilding(s, 1, "constructionYard", 20, 20);
  addBuilding(s, 1, "power", 18, 20);
  addBuilding(s, 1, "refinery", 16, 20);
  return s;
}

describe("tryBuildPower / tryBuildRefinery", () => {
  it("returns false when credits are insufficient", () => {
    const s = enemyState();
    s.credits[1] = 0;
    const yard = living(s).find((e) => e.kind === "constructionYard" && e.owner === 1)!;
    expect(tryBuildPower(s, yard.x, yard.y)).toBe(false);
  });

  it("does not queue duplicate power plants while one is constructing", () => {
    const s = enemyState();
    const yard = living(s).find((e) => e.kind === "constructionYard" && e.owner === 1)!;
    const plant = addBuilding(s, 1, "power", 14, 20, 100);
    expect(plant.constructing).toBe(100);
    expect(tryBuildPower(s, yard.x, yard.y)).toBe(false);
    expect(living(s).filter((e) => e.owner === 1 && e.kind === "power")).toHaveLength(2);
  });
});

describe("tryBuildForwardInfrastructure", () => {
  it("returns false during opening phase", () => {
    const s = enemyState();
    s.tutorialStage = "move";
    const yard = living(s).find((e) => e.kind === "constructionYard" && e.owner === 1)!;
    expect(tryBuildForwardInfrastructure(s, yard)).toBe(false);
  });

  it("returns false when power is negative", () => {
    const s = enemyState();
    for (const e of living(s).filter((e) => e.kind === "power" && e.owner === 1)) e.hp = 0;
    const yard = living(s).find((e) => e.kind === "constructionYard" && e.owner === 1)!;
    expect(tryBuildForwardInfrastructure(s, yard)).toBe(false);
  });

  it("returns false when there are already >= 2 refineries", () => {
    const s = enemyState();
    addBuilding(s, 1, "refinery", 14, 20);
    const yard = living(s).find((e) => e.kind === "constructionYard" && e.owner === 1)!;
    expect(tryBuildForwardInfrastructure(s, yard)).toBe(false);
  });
});

describe("tryBuildTurret", () => {
  it("returns false when turret cap is reached", () => {
    const s = enemyState();
    const yard = living(s).find((e) => e.kind === "constructionYard" && e.owner === 1)!;
    for (let i = 0; i < 10; i++) {
      addBuilding(s, 1, "turret", 10 + i, 10);
    }
    const threat = living(s).find((e) => e.kind === "turret")!;
    expect(tryBuildTurret(s, yard, threat)).toBe(false);
  });

  it("returns false when a turret is still constructing", () => {
    const s = enemyState();
    s.missionIndex = 2;
    const yard = living(s).find((e) => e.kind === "constructionYard" && e.owner === 1)!;
    const turret = addBuilding(s, 1, "turret", 15, 15, 100);
    turret.constructing = 50;
    expect(tryBuildTurret(s, yard, turret)).toBe(false);
  });

  it("returns false when no build site is available", () => {
    const s = makeFixture({ width: 5, height: 5, win: { kind: "annihilate" } });
    s.credits[1] = 50_000;
    addBuilding(s, 1, "constructionYard", 0, 0);
    addBuilding(s, 1, "power", 2, 0);
    addBuilding(s, 1, "turret", 0, 2);
    addBuilding(s, 1, "turret", 2, 2);
    addBuilding(s, 1, "turret", 4, 2);
    addBuilding(s, 1, "turret", 0, 4);
    addBuilding(s, 1, "turret", 2, 4);
    addBuilding(s, 1, "turret", 4, 4);
    addBuilding(s, 1, "power", 4, 0);
    addBuilding(s, 1, "power", 0, 1);
    addBuilding(s, 1, "power", 2, 1);
    addBuilding(s, 1, "power", 4, 1);
    const yard = living(s).find((e) => e.kind === "constructionYard" && e.owner === 1)!;
    const threat = living(s).find((e) => e.kind === "power" && e.owner === 1)!;
    expect(tryBuildTurret(s, yard, threat)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  EXCLUDED_SCENARIO_KINDS,
  PREVIEW_CYCLE_MS,
  PREVIEW_IDLE_MS,
  PREVIEW_INITIAL_DELAY_MS,
  PREVIEW_LOCK_COUNT,
  PREVIEW_PLAY_MS,
  normalMissionIndices,
  previewAt,
  previewMissionIndex,
  previewScenarioKind,
  previewSeed,
} from "../../components/shared/ambient/menuBackdropSim/cycle";
import { CINEMA_SHOTS, cinemaShotCamera, PIP_ZOOM, PREVIEW_SHOT_COUNT } from "../../components/shared/ambient/menuBackdropSim/shots";
import { cinemaGroundWorld } from "../../components/shared/ambient/menuBackdropSim/paint";
import { stepCinemaScene } from "../../components/shared/ambient/menuBackdropSim/render";
import { CINEMA_SCENARIO_KINDS, CINEMA_SEED, createCinemaScene, type Shot } from "../../components/shared/ambient/menuBackdropSim/scene";
import { createCampaign } from "../../lib/gen/campaign";
import { footprintOf } from "../../lib/catalog";
import { createMission } from "../../lib/sim/api";
import { tileToScreen } from "../../lib/iso";
import { isTerrainAtlasReady, preloadTerrainAtlas } from "../../lib/render/terrainAtlas";
import { areRasterSourcesReady, preloadRasterSources } from "../../lib/render/sprites";
import { listTacticalRasterSources } from "../../lib/gen/visualAssets";
import { terrainAccess } from "../../lib/sim/world";
import type { BuildingEntity } from "../../lib/types";

describe("welcome target preview cycle", () => {
  it("waits 5 seconds before showing the first highlight, then plays for 5s and idles for 3s", () => {
    expect(PREVIEW_INITIAL_DELAY_MS).toBe(5000);
    expect(PREVIEW_PLAY_MS).toBe(5000);
    expect(PREVIEW_IDLE_MS).toBe(3000);
    expect(previewAt(0)).toEqual({ expanded: false, lockIndex: 0, shotIndex: 0, cycleIndex: 0, missionIndex: 0, scenarioKind: "baseAssault" });
    expect(previewAt(PREVIEW_INITIAL_DELAY_MS - 1)).toMatchObject({ expanded: false, lockIndex: 0, cycleIndex: 0 });
    expect(previewAt(PREVIEW_INITIAL_DELAY_MS)).toEqual({ expanded: true, lockIndex: 0, shotIndex: 0, cycleIndex: 0, missionIndex: 0, scenarioKind: "baseAssault" });
    expect(previewAt(PREVIEW_INITIAL_DELAY_MS + PREVIEW_PLAY_MS - 1)).toMatchObject({ expanded: true, lockIndex: 0, shotIndex: 0, cycleIndex: 0 });
    expect(previewAt(PREVIEW_INITIAL_DELAY_MS + PREVIEW_PLAY_MS)).toMatchObject({ expanded: false, lockIndex: 0, cycleIndex: 0 });
    expect(previewAt(PREVIEW_INITIAL_DELAY_MS + PREVIEW_CYCLE_MS - 1)).toMatchObject({ expanded: false, lockIndex: 0, cycleIndex: 0 });
    expect(previewAt(PREVIEW_INITIAL_DELAY_MS + PREVIEW_CYCLE_MS)).toMatchObject({ expanded: true, lockIndex: 1, shotIndex: 1, cycleIndex: 1, scenarioKind: "turretDefense" });
  });

  it("rotates distinct scenario kinds across consecutive preview cycles", () => {
    for (let i = 0; i < CINEMA_SCENARIO_KINDS.length; i++) {
      expect(previewScenarioKind(i)).toBe(CINEMA_SCENARIO_KINDS[i]);
      expect(previewAt(PREVIEW_INITIAL_DELAY_MS + i * PREVIEW_CYCLE_MS).scenarioKind).toBe(CINEMA_SCENARIO_KINDS[i]);
    }
  });

  it("round-robins locks and advances to a different shot each play window", () => {
    const first = previewAt(PREVIEW_INITIAL_DELAY_MS);
    const second = previewAt(PREVIEW_INITIAL_DELAY_MS + PREVIEW_CYCLE_MS);
    const third = previewAt(PREVIEW_INITIAL_DELAY_MS + PREVIEW_CYCLE_MS * 2);
    expect(first.lockIndex).toBe(0);
    expect(second.lockIndex).toBe(1);
    expect(third.lockIndex).toBe(2);
    expect(new Set([first.shotIndex, second.shotIndex, third.shotIndex]).size).toBe(3);
    expect(previewAt(PREVIEW_INITIAL_DELAY_MS + PREVIEW_CYCLE_MS * PREVIEW_LOCK_COUNT).lockIndex).toBe(0);
    expect(previewAt(PREVIEW_INITIAL_DELAY_MS + PREVIEW_CYCLE_MS * PREVIEW_SHOT_COUNT).shotIndex).toBe(0);
  });

  it("treats negative time as the opening play window", () => {
    expect(previewAt(-40)).toEqual(previewAt(0));
  });

  it("uses a different campaign seed each cycle and wraps the four-digit range", () => {
    expect(previewSeed(0)).toBe(CINEMA_SEED);
    expect(previewSeed(1)).not.toBe(previewSeed(0));
    expect(previewSeed(2)).not.toBe(previewSeed(1));
    expect(previewSeed(0)).toBeGreaterThanOrEqual(0);
    expect(previewSeed(0)).toBeLessThanOrEqual(9999);
    expect(previewSeed(10000)).toBe(previewSeed(0));
  });
});

describe("welcome target cinema shots", () => {
  it("keeps a playlist of distinct camera subjects", () => {
    expect(CINEMA_SHOTS.length).toBe(PREVIEW_SHOT_COUNT);
    expect(PREVIEW_SHOT_COUNT).toBeGreaterThanOrEqual(4);
    const keys = CINEMA_SHOTS.map((shot) => `${shot.type}:${shot.index}`);
    expect(new Set(keys).size).toBe(CINEMA_SHOTS.length);
  });

  it("frames different shots at a mid zoom between the original close-up and the wide crop", () => {
    const scene = createCinemaScene();
    const cameras = CINEMA_SHOTS.map((_, index) => cinemaShotCamera(scene, index, 768, 512));
    const origins = new Set(cameras.map((cam) => `${cam.x.toFixed(1)},${cam.y.toFixed(1)}`));
    expect(origins.size).toBe(CINEMA_SHOTS.length);
    expect(cameras.every((cam) => cam.zoom === PIP_ZOOM)).toBe(true);
    expect(PIP_ZOOM).toBe(1.5);
  });

  it("builds different campaigns from different seeds", () => {
    const first = createCinemaScene(previewSeed(0));
    const second = createCinemaScene(previewSeed(1));
    expect(first.seed).not.toBe(second.seed);
    const sameTiles = first.map.tiles.every((tile, index) => tile === second.map.tiles[index]);
    const samePalette = first.us.palette.primary === second.us.palette.primary
      && first.them.palette.primary === second.them.palette.primary;
    expect(sameTiles && first.map.biome === second.map.biome && samePalette).toBe(false);
  });

  it("uses mission 0 biome, size, and tiles for the campaign seed", () => {
    const scene = createCinemaScene(previewSeed(0));
    const mission = createMission({ seed: scene.seed, missionIndex: 0 });
    expect(scene.map.biome).toBe(mission.biome);
    expect(scene.map.width).toBe(mission.width);
    expect(scene.map.height).toBe(mission.height);
    expect(scene.map.tiles).toEqual(mission.tiles);
    expect(cinemaGroundWorld(scene)).toBe(scene.ground);
    expect(cinemaGroundWorld(scene).seed).toBe(scene.seed);
  });

  it("steps actors independently of rendering", () => {
    const scene = createCinemaScene();
    const shots: { ax: number; ay: number; bx: number; by: number; life: number }[] = [];
    const before = scene.actors.map((actor) => ({ x: actor.x, y: actor.y, wi: actor.wi }));
    stepCinemaScene(scene, shots, 1);
    const moved = scene.actors.some((actor, index) => actor.x !== before[index]!.x || actor.y !== before[index]!.y);
    expect(moved).toBe(true);
    stepCinemaScene(scene, shots, 48);
    expect(shots.length).toBeGreaterThan(0);
  });

  it("shares the same atlas-compatible ground world used by gameplay", () => {
    const missionIndex = 2;
    const scene = createCinemaScene(previewSeed(0), missionIndex);
    const world = cinemaGroundWorld(scene);
    const mission = createMission({ seed: scene.seed, missionIndex });
    expect(world).toBe(scene.ground);
    expect(world.seed).toBe(mission.seed);
    expect(world.missionIndex).toBe(mission.missionIndex);
    expect(world.biome).toBe(mission.biome);
    expect(world.tiles).toEqual(mission.tiles);
    expect(world.surfaces).toEqual(mission.surfaces);
  });

  it("cycles mission index across normal combat missions, excluding scenario kinds", () => {
    const campaign = createCampaign(CINEMA_SEED);
    const normal = normalMissionIndices(CINEMA_SEED);
    expect(normal.length).toBeGreaterThan(0);
    for (const idx of normal) {
      expect(EXCLUDED_SCENARIO_KINDS).not.toContain(campaign.missions[idx]!.win.kind);
    }
    expect(previewMissionIndex(0, CINEMA_SEED)).toBe(normal[0]);
    expect(previewMissionIndex(1, CINEMA_SEED)).toBe(normal[1 % normal.length]);
    expect(previewMissionIndex(normal.length, CINEMA_SEED)).toBe(normal[0]);
  });

  it("clears fog of war and primes frontline combat units in cinema scenes", () => {
    const scene = createCinemaScene(1847, 2);
    expect(scene.missionIndex).toBe(2);
    expect(scene.state).toBeDefined();
    expect(scene.state.fog.every((val) => val === 2)).toBe(true);
    const combatUnits = scene.state.entities.filter((e) => e.class === "unit" && e.hp > 0);
    expect(combatUnits.length).toBeGreaterThanOrEqual(6);
    expect(scene.combatEpicenter).toBeDefined();
  });

  it("keeps cinema destruction bursts domain-aware", () => {
    const scene = createCinemaScene(1847, 0, "baseAssault");
    const shots: Shot[] = [];
    const target = scene.state.entities.find((entity) => entity.class === "unit" && entity.kind === "infantry");
    const attacker = scene.state.entities.find((entity) => entity.class === "unit" && entity.kind === "tank");
    expect(target).toBeDefined();
    expect(attacker).toBeDefined();

    target!.hp = 1;
    target!.x = attacker!.x + 1;
    target!.y = attacker!.y;
    attacker!.attackTarget = target!.id;
    attacker!.cooldown = 0;

    for (let frame = 0; frame < 30 && !scene.fx.some((burst) => burst.kind === "destruction"); frame++) {
      stepCinemaScene(scene, shots, frame, frame * (1000 / 60));
    }

    const destruction = scene.fx.filter((burst) => burst.kind === "destruction");
    expect(destruction.some((burst) => burst.entityKind === "infantry" && burst.targetDomain === "human")).toBe(true);
  });

  it("includes real varied structures belonging to only one defending faction in every preview scenario", () => {
    const buildingShots = CINEMA_SHOTS.filter((shot) => shot.type === "building");
    const structureKinds = new Set<string>();
    expect(buildingShots.length).toBeGreaterThanOrEqual(2);

    for (const kind of CINEMA_SCENARIO_KINDS) {
      const scene = createCinemaScene(CINEMA_SEED, 0, kind);
      const activeBuildings = scene.state.entities.filter((entity) => entity.class === "building" && entity.hp > 0);
      expect(activeBuildings.length).toBeGreaterThanOrEqual(2);

      // Verify that all buildings belong strictly to one faction (either all player 0 or all enemy 1)
      const owners = new Set(activeBuildings.map((b) => b.owner));
      expect(owners.size).toBe(1);
      const sceneBuildingOwners = new Set(scene.buildings.map((b) => b.owner));
      expect(sceneBuildingOwners.size).toBe(1);
      expect(owners.values().next().value).toBe(sceneBuildingOwners.values().next().value);

      for (const building of activeBuildings) structureKinds.add(building.kind);

      for (const shot of buildingShots) {
        const building = scene.buildings[shot.index];
        expect(building).toBeDefined();
        expect(activeBuildings.some((entity) => entity.kind === building!.kind && entity.owner === building!.owner && entity.x === building!.x && entity.y === building!.y)).toBe(true);
      }
    }
    expect(structureKinds.size).toBeGreaterThanOrEqual(4);
  });

  it("places preview structures on valid, separated building footprints", () => {
    for (const kind of CINEMA_SCENARIO_KINDS) {
      const scene = createCinemaScene(CINEMA_SEED, 0, kind);
      const buildings = scene.state.entities.filter(
        (entity): entity is BuildingEntity => entity.class === "building" && entity.hp > 0,
      );

      for (const building of buildings) {
        const footprint = footprintOf(building.kind);
        const baseHeight = scene.state.heights[building.y * scene.state.width + building.x];
        for (let oy = 0; oy < footprint.h; oy++) {
          for (let ox = 0; ox < footprint.w; ox++) {
            const x = building.x + ox;
            const y = building.y + oy;
            expect(terrainAccess(scene.state, x, y).buildable).toBe(true);
            expect(scene.state.heights[y * scene.state.width + x]).toBe(baseHeight);
          }
        }
      }

      for (let i = 0; i < buildings.length; i++) {
        const first = buildings[i]!;
        const firstFootprint = footprintOf(first.kind);
        for (let j = i + 1; j < buildings.length; j++) {
          const second = buildings[j]!;
          const secondFootprint = footprintOf(second.kind);
          const overlaps =
            first.x < second.x + secondFootprint.w &&
            first.x + firstFootprint.w > second.x &&
            first.y < second.y + secondFootprint.h &&
            first.y + firstFootprint.h > second.y;
          expect(overlaps).toBe(false);
        }
      }
    }
  });

  it("keeps every preview scenario playing while combat advances after warm-up", () => {
    for (const kind of CINEMA_SCENARIO_KINDS) {
      const scene = createCinemaScene(CINEMA_SEED, 0, kind);
      const warmupTick = scene.state.tick;
      const initialHealth = new Map(
        scene.state.entities
          .filter((entity) => entity.class === "unit" && entity.hp > 0)
          .map((entity) => [entity.id, entity.hp]),
      );
      const shots: Shot[] = [];
      let sawShot = false;

      expect(scene.state.result).toBe("playing");
      for (let frame = 0; frame < 120; frame++) {
        stepCinemaScene(scene, shots, frame);
        sawShot ||= shots.length > 0;
      }

      const healthChanged = scene.state.entities.some(
        (entity) => entity.class === "unit" && initialHealth.has(entity.id) && entity.hp !== initialHealth.get(entity.id),
      );
      expect(scene.state.tick).toBeGreaterThan(warmupTick);
      expect(scene.state.result).toBe("playing");
      expect(sawShot).toBe(true);
      expect(healthChanged).toBe(true);
    }
  });

  it("uses the actual fixed tick rate and keeps the map focus stable during a play window", () => {
    for (const kind of CINEMA_SCENARIO_KINDS) {
      const sixtyHz = createCinemaScene(CINEMA_SEED, 0, kind);
      const oneTwentyHz = createCinemaScene(CINEMA_SEED, 0, kind);
      const sixtyShots: Shot[] = [];
      const oneTwentyShots: Shot[] = [];

      for (let frame = 0; frame <= 60; frame++) {
        stepCinemaScene(sixtyHz, sixtyShots, frame, frame * (1000 / 60));
      }
      for (let frame = 0; frame <= 120; frame++) {
        stepCinemaScene(oneTwentyHz, oneTwentyShots, frame, frame * (1000 / 120));
      }

      expect(sixtyHz.state.tick).toBe(oneTwentyHz.state.tick);
      const focus = { ...sixtyHz.combatEpicenter };
      const cameras = CINEMA_SHOTS.map((_, shot) => cinemaShotCamera(sixtyHz, shot, 768, 512));
      for (let frame = 61; frame <= 300; frame++) {
        stepCinemaScene(sixtyHz, sixtyShots, frame, frame * (1000 / 60));
        expect(sixtyHz.combatEpicenter).toEqual(focus);
        for (let shot = 0; shot < CINEMA_SHOTS.length; shot++) {
          expect(cinemaShotCamera(sixtyHz, shot, 768, 512)).toEqual(cameras[shot]);
        }
      }
    }
  });

  it("ages combat shots by elapsed time instead of render-frame count", () => {
    const sixtyHz = createCinemaScene();
    const oneTwentyHz = createCinemaScene();
    const sixtyShot: Shot = { ax: 0, ay: 0, bx: 1, by: 1, life: 1000 };
    const oneTwentyShot: Shot = { ax: 0, ay: 0, bx: 1, by: 1, life: 1000 };
    const sixtyShots = [sixtyShot];
    const oneTwentyShots = [oneTwentyShot];

    for (let frame = 0; frame <= 3; frame++) {
      stepCinemaScene(sixtyHz, sixtyShots, frame, frame * (1000 / 60));
    }
    for (let frame = 0; frame <= 6; frame++) {
      stepCinemaScene(oneTwentyHz, oneTwentyShots, frame, frame * (1000 / 120));
    }

    expect(sixtyShot.life).toBeCloseTo(950, 5);
    expect(oneTwentyShot.life).toBeCloseTo(950, 5);
  });

  it("frames all frontline battle units within the PIP feed bounds across all scenarios and shots", () => {
    for (const kind of CINEMA_SCENARIO_KINDS) {
      const scene = createCinemaScene(CINEMA_SEED, 0, kind);
      const clashCombatants = scene.state.entities.filter(
        (e) => (e.class === "unit" || e.kind === "turret") && e.hp > 0 && Math.hypot(e.x - scene.combatEpicenter.x, e.y - scene.combatEpicenter.y) <= 6,
      );
      expect(clashCombatants.length).toBeGreaterThanOrEqual(6);

      for (let shot = 0; shot < CINEMA_SHOTS.length; shot++) {
        const cam = cinemaShotCamera(scene, shot, 256, 160);
        for (const u of clashCombatants) {
          const elev = scene.map.heights[Math.floor(u.y) * scene.map.width + Math.floor(u.x)] ?? 1;
          const s = tileToScreen(u.x, u.y, cam, elev);
          expect(s.x).toBeGreaterThanOrEqual(0);
          expect(s.x).toBeLessThanOrEqual(256);
          expect(s.y).toBeGreaterThanOrEqual(0);
          expect(s.y).toBeLessThanOrEqual(160);
        }
      }
    }
  });

  it("verifies and preloads terrain atlas and raster sprite readiness before displaying gameplay", async () => {
    const scene = createCinemaScene(CINEMA_SEED, 0);
    expect(isTerrainAtlasReady(scene.ground)).toBe(true);
    if (scene.state) {
      expect(isTerrainAtlasReady(scene.state)).toBe(true);
      const ready = await preloadTerrainAtlas(scene.state);
      expect(ready).toBe(true);
    }
    const sources = listTacticalRasterSources();
    expect(sources.length).toBeGreaterThan(0);
    preloadRasterSources(sources);
    expect(areRasterSourcesReady(sources)).toBe(true);
  });

  it("rotates across distinct tactical scenarios including building attacks and ambushes", () => {
    expect(CINEMA_SCENARIO_KINDS).toEqual([
      "baseAssault",
      "turretDefense",
      "harvesterAmbush",
      "armorClash",
      "infantryStorm",
      "convoyRaid",
    ]);

    const generatedKinds = new Set<string>();
    for (let i = 0; i < CINEMA_SCENARIO_KINDS.length; i++) {
      const scene = createCinemaScene(CINEMA_SEED + i, 0);
      generatedKinds.add(scene.scenarioKind);
    }
    expect(generatedKinds.size).toBe(CINEMA_SCENARIO_KINDS.length);
  });

  it("spawns and engages defensive buildings in base assault and turret defense scenarios", () => {
    const baseAssaultIdx = CINEMA_SCENARIO_KINDS.indexOf("baseAssault");
    const baseAssaultScene = createCinemaScene(baseAssaultIdx, 0);
    expect(baseAssaultScene.scenarioKind).toBe("baseAssault");
    const enemyTurret = baseAssaultScene.state.entities.find(
      (e) => e.class === "building" && e.kind === "turret" && e.owner === 1,
    );
    expect(enemyTurret).toBeDefined();
    const attackingTurret = baseAssaultScene.state.entities.some(
      (e) => e.class === "unit" && e.attackTarget === enemyTurret!.id,
    );
    expect(attackingTurret).toBe(true);

    const turretDefenseIdx = CINEMA_SCENARIO_KINDS.indexOf("turretDefense");
    const turretDefenseScene = createCinemaScene(turretDefenseIdx, 0);
    expect(turretDefenseScene.scenarioKind).toBe("turretDefense");
    const playerTurret = turretDefenseScene.state.entities.find(
      (e) => e.class === "building" && e.kind === "turret" && e.owner === 0,
    );
    expect(playerTurret).toBeDefined();
    const attackingPlayerTurret = turretDefenseScene.state.entities.some(
      (e) => e.class === "unit" && e.attackTarget === playerTurret!.id,
    );
    expect(attackingPlayerTurret).toBe(true);
  });

  it("keeps camera motion smooth with no sudden pixel jumps or cliff elevation flips during combat", () => {
    for (const kind of CINEMA_SCENARIO_KINDS) {
      const scene = createCinemaScene(CINEMA_SEED, 0, kind);
      const shots: Shot[] = [];
      let prevX = 0;
      let prevY = 0;

      for (let f = 0; f < 100; f++) {
        stepCinemaScene(scene, shots, f);
        const cam = cinemaShotCamera(scene, 0, 768, 512);
        if (f > 0) {
          const delta = Math.hypot(cam.x - prevX, cam.y - prevY);
          expect(delta).toBeLessThanOrEqual(2.0);
        }
        prevX = cam.x;
        prevY = cam.y;
      }
    }
  });

  it("keeps unit motion stable with no violent back-and-forth position flapping", () => {
    for (const kind of CINEMA_SCENARIO_KINDS) {
      const scene = createCinemaScene(CINEMA_SEED, 0, kind);
      const shots: Shot[] = [];
      const history = new Map<number, { x: number; y: number }[]>();

      for (let f = 0; f < 100; f++) {
        stepCinemaScene(scene, shots, f);
        for (const u of scene.state.entities) {
          if (u.class !== "unit" || u.hp <= 0) continue;
          if (!history.has(u.id)) history.set(u.id, []);
          const list = history.get(u.id)!;
          list.push({ x: u.x, y: u.y });
          if (list.length >= 3) {
            const p0 = list[list.length - 3]!;
            const p1 = list[list.length - 2]!;
            const p2 = list[list.length - 1]!;
            const dx1 = p1.x - p0.x;
            const dy1 = p1.y - p0.y;
            const dx2 = p2.x - p1.x;
            const dy2 = p2.y - p1.y;
            const dot = dx1 * dx2 + dy1 * dy2;
            const dist1 = Math.hypot(dx1, dy1);
            const dist2 = Math.hypot(dx2, dy2);
            const isOscillating = dot < -0.001 && dist1 > 0.05 && dist2 > 0.05;
            expect(isOscillating).toBe(false);
          }
        }
      }
    }
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { addUnit, makeFixture, setTile } from "../../lib/sim/fixtures";
import { fogIndex } from "../../lib/sim/fog";
import { SURFACE_ROAD, TILE_RESOURCE, TILE_WATER } from "../../lib/types";
import { UNIT_STATS } from "../../lib/catalog";
import { unitAnim } from "../../lib/render/anim";
import { activeUnitGathering, activeUnitSupport, drawUnitWorkFx, unitBodyMotion } from "../../lib/render/unitPresentation";
import { clearUnitTrails, MAX_UNIT_TRAIL_MARKS, MAX_UNIT_TRAIL_PARTICLES, unitTrailSurface, updateUnitTrails } from "../../lib/render/unitTrails";
import { MAX_UNIT_LIGHTS, unitLights, unitLightStrength } from "../../lib/render/unitLighting";
import { vehicleTurretFacing } from "../../lib/render/unitVehicleLayers";
import { createCamera } from "../../lib/iso";
import { UNIT_ACTION_ART, UNIT_VEHICLE_LAYERS, unitAnimationSources } from "../../lib/gen/unitAnimationAssets";
import { unitWalkFrameCrop } from "../../lib/gen/visualAssets";
import { unitSprite } from "../../lib/gen/assets";
import { opaquePixelBounds } from "../../lib/render/sprites";
import type { FxBurst } from "../../lib/render/fx";

describe("unit presentation", () => {
  beforeEach(clearUnitTrails);
  it("shows support only for a living, eligible allied patient within range", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const medic = addUnit(state, 0, "medic", 2, 2), patient = addUnit(state, 0, "infantry", 3, 2);
    patient.hp -= 20;
    expect(activeUnitSupport(medic, patient)).toBe(true);
    expect(activeUnitSupport(medic, { ...patient, owner: 1 })).toBe(false);
    expect(activeUnitSupport(medic, { ...patient, kind: "tank" })).toBe(false);
    expect(activeUnitSupport(medic, { ...patient, x: 9 })).toBe(false);
    expect(activeUnitSupport(medic, { ...patient, hp: 0 })).toBe(false);
    medic.supportMode = "hold"; expect(activeUnitSupport(medic, patient)).toBe(false);
    medic.supportMode = "auto"; medic.path = [{ x: 3, y: 2 }]; expect(activeUnitSupport(medic, patient)).toBe(false);
  });
  it("runs gathering machinery only near nonempty ore while stationary", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const harvester = addUnit(state, 0, "harvester", 2, 2);
    harvester.gatherX = 3; harvester.gatherY = 2; setTile(state, 3, 2, TILE_RESOURCE, 100);
    expect(activeUnitGathering(state, harvester)).toBe(true);
    harvester.path = [{ x: 3, y: 2 }]; expect(activeUnitGathering(state, harvester)).toBe(false);
    harvester.path = []; setTile(state, 3, 2, TILE_RESOURCE, 0); expect(activeUnitGathering(state, harvester)).toBe(false);
  });
  it("hides work effects in fog and never places sparks on a hidden repair target", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const truck = addUnit(state, 1, "repairTruck", 2, 2), target = addUnit(state, 1, "tank", 3, 2);
    target.hp -= 20;
    const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), ellipse: vi.fn(), fill: vi.fn(),
      arc: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), globalAlpha: 1 } as unknown as CanvasRenderingContext2D;
    const options = { state, alpha: 0.22, targetScreen: { x: 300, y: 300 } };
    state.fog.fill(0); state.fog[fogIndex(state, 2, 2)!] = 1;
    drawUnitWorkFx(ctx, truck, target, 20, 20, 1, 1000, false, options);
    expect(ctx.save).not.toHaveBeenCalled();
    state.fog[fogIndex(state, 2, 2)!] = 2;
    drawUnitWorkFx(ctx, truck, target, 20, 20, 1, 1000, false, options);
    expect(ctx.ellipse).toHaveBeenCalled(); // Visible truck exhaust remains.
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
    state.fog[fogIndex(state, 3, 2)!] = 2;
    drawUnitWorkFx(ctx, truck, target, 20, 20, 1, 1000, true, options);
    expect(ctx.arc).toHaveBeenCalledWith(300, 292, 1.7, 0, Math.PI * 2);
    expect(ctx.globalAlpha).toBeCloseTo(0.22 * 0.25);
  });
  it("keeps decoration still with reduced motion and freezes at a fixed animation clock", () => {
    const state = makeFixture({ win: { kind: "annihilate" } }), tank = addUnit(state, 0, "tank", 2, 2);
    const dyn = { moveSpeed: 1, recoil: 0.5, roll: 0.2, suspensionY: -0.3, chassisLean: 0.03 };
    expect(unitBodyMotion(tank, unitAnim(tank, 0), dyn, 1000, true)).toEqual({ lift: 0, lean: 0, scaleY: 1 });
    expect(unitBodyMotion(tank, unitAnim(tank, 0), dyn, 1000)).toEqual(unitBodyMotion(tank, unitAnim(tank, 0), dyn, 1000));
  });
  it("makes trails equally spaced at different render cadences", () => {
    const sample = (frames: number) => {
      clearUnitTrails(); const state = makeFixture({ win: { kind: "annihilate" } }), tank = addUnit(state, 0, "tank", 2, 2);
      updateUnitTrails(state, new Map(), 0);
      for (let i = 1; i <= frames; i++) { tank.x = 2 + 1.92 * i / frames; updateUnitTrails(state, new Map(), i * 1000 / frames); }
      return updateUnitTrails(state, new Map(), 1000).filter(mark => !mark.particle).map(mark => mark.x);
    };
    expect(sample(60)).toEqual(sample(6));
  });
  it("expires trails, drops moving particles in reduced motion, and resets on clock rewind", () => {
    const state = makeFixture({ win: { kind: "annihilate" } }), tank = addUnit(state, 0, "tank", 2, 2);
    updateUnitTrails(state, new Map(), 0); tank.x += 0.64;
    const marks = updateUnitTrails(state, new Map(), 100);
    expect(marks.some(mark => mark.particle)).toBe(true);
    expect(updateUnitTrails(state, new Map(), 200, true).some(mark => mark.particle)).toBe(false);
    expect(updateUnitTrails(state, new Map(), 8000)).toHaveLength(0);
    tank.x += 0.64; updateUnitTrails(state, new Map(), 8100);
    expect(updateUnitTrails(state, new Map(), 0)).toHaveLength(0);
  });
  it("does not expose movement through fog, stamp aircraft, or emit dirt on roads", () => {
    const state = makeFixture({ win: { kind: "annihilate" } }), tank = addUnit(state, 1, "tank", 2, 2);
    state.fog.fill(0); updateUnitTrails(state, new Map(), 0); tank.x += 0.64;
    expect(updateUnitTrails(state, new Map(), 100)).toHaveLength(0);
    state.fog.fill(2); state.surfaces[2 * state.width + 3] = SURFACE_ROAD;
    expect(unitTrailSurface(state, 3, 2)).toBeNull();
    setTile(state, 4, 2, TILE_WATER); expect(unitTrailSurface(state, 4, 2)).toBe("water");
    clearUnitTrails(); state.entities = []; const plane = addUnit(state, 0, "strikePlane", 2, 2);
    updateUnitTrails(state, new Map(), 0); plane.x++; expect(updateUnitTrails(state, new Map(), 100)).toHaveLength(0);
  });
  it("caps trail history in a crowded battle", () => {
    const state = makeFixture({ win: { kind: "annihilate" }, width: 100, height: 100 });
    for (let i=0;i<200;i++) addUnit(state, 0, "tank", 2 + i % 20, 2 + Math.floor(i/20));
    updateUnitTrails(state,new Map(),0);
    for(let tick=1;tick<=20;tick++){ for(const e of state.entities)e.x+=0.64; updateUnitTrails(state,new Map(),tick*10); }
    const marks=updateUnitTrails(state,new Map(),200);
    expect(marks.filter(mark=>!mark.particle)).toHaveLength(MAX_UNIT_TRAIL_MARKS);
    expect(marks.filter(mark=>mark.particle)).toHaveLength(MAX_UNIT_TRAIL_PARTICLES);
  });
  it("bounds local lights and excludes hidden, future and expired bursts", () => {
    const state=makeFixture({win:{kind:"annihilate"}}), cam=createCamera();
    const burst: FxBurst={id:1,kind:"muzzle",x:2,y:2,elev:1,bornMs:0,durationMs:140,entityKind:"tank",entityClass:"unit",owner:0};
    const lights=unitLights(state,cam,Array.from({length:20},(_,id)=>({...burst,id})),50);
    expect(lights).toHaveLength(MAX_UNIT_LIGHTS);
    expect(unitLights(state,cam,[burst],200)).toHaveLength(0);
    expect(unitLights(state,cam,[{...burst,bornMs:100}],50)).toHaveLength(0);
    state.fog[fogIndex(state,2,2)!]=0; expect(unitLights(state,cam,[burst],50)).toHaveLength(0);
    expect(unitLightStrength(lights,lights[0]!.x+10000,lights[0]!.y)).toBe(0);
  });
  it("resolves independent turret directions without rotating raster views", () => {
    for(let facing=0;facing<8;facing++)expect(vehicleTurretFacing(facing/8*Math.PI*2-Math.PI/2)).toBe(facing);
    expect(UNIT_STATS.tank.cooldown).toBeGreaterThan(0);
  });
  it("ships eight complete layered views and four planted frames per action", async () => {
    const state=makeFixture({win:{kind:"annihilate"}});
    for(const [kind,poses] of Object.entries(UNIT_ACTION_ART))for(const [motion,views] of Object.entries(poses)){
      expect(Object.keys(views)).toHaveLength(8);
      for(const [view,path] of Object.entries(views)){
        const metadata=await sharp("public"+path).metadata(); expect(metadata.hasAlpha).toBe(true); expect(metadata.width).toBe(1024); expect(metadata.height).toBe(1024);
        for(const frame of [0,1,2,3] as const){
          const crop=unitWalkFrameCrop(frame);
          const {data,info}=await sharp("public"+path).extract({left:crop.x,top:crop.y,width:crop.w,height:crop.h}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
          const b=opaquePixelBounds(data,info.width,info.height)!;
          expect(b,`${kind} ${motion} ${view} ${frame}`).toBeDefined();
          expect(Math.abs(b.minY+b.height-500),`${kind} ${motion} ${view} ${frame}`).toBeLessThanOrEqual(1);
        }
      }
    }
    for(const [kind,views] of Object.entries(UNIT_VEHICLE_LAYERS)){
      expect(Object.keys(views)).toHaveLength(8); expect(unitAnimationSources(kind as "tank"|"behemoth")).toHaveLength(24);
      for(const parts of Object.values(views))for(const role of ["hull","turret","barrel"] as const){ const meta=await sharp("public"+parts[role]).metadata();expect(meta.hasAlpha).toBe(true);expect(meta.width).toBe(512); }
    }
    const action=unitSprite("infantry",state.factions[0]!.palette,{motion:"fire",animationFrame:2});
    expect(action.imageSrc).toContain("-fire-v1.webp");expect(action.imageAnchorY).toBe(1012/1024);
  });
});

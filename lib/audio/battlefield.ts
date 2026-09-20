import { UNIT_STATS, isUnitKind } from "../catalog";
import type { Camera } from "../iso";
import type { BuildingKind, SimEvent, UnitKind, WeaponType } from "../types";
import { duckMusic } from "./mixer";
import { spatialAudioForWorld } from "./spatial";
import { playSfx, type SfxKind } from "./synth";

export function fireSfxFor(attackerKind: UnitKind | BuildingKind, weapon: WeaponType): SfxKind {
  if (attackerKind === "infantry") return "smallArms";
  if (attackerKind === "antiArmor") return "antiArmor";
  if (attackerKind === "tank") return "cannon";
  if (attackerKind === "turret" || attackerKind === "antiAirTurret") return "turret";
  if (attackerKind === "strikePlane") return "cannon";
  if (weapon === "smallArms") return "smallArms";
  if (weapon === "antiArmor") return "antiArmor";
  return "cannon";
}

export function impactSfxFor(targetKind: UnitKind | BuildingKind): SfxKind {
  if (!isUnitKind(targetKind)) return "impact";
  return UNIT_STATS[targetKind].domain === "human" ? "impactFlesh" : "impactMetal";
}

export function destructionCueFor(kind: UnitKind | BuildingKind): { kind: SfxKind; heavy: boolean } {
  if (!isUnitKind(kind)) return { kind: "destruction", heavy: true };
  return UNIT_STATS[kind].domain === "human"
    ? { kind: "wreckHuman", heavy: false }
    : { kind: "wreckVehicle", heavy: false };
}

export function supportSfxFor(providerKind: UnitKind): SfxKind {
  return providerKind === "medic" ? "heal" : "repair";
}

export function impactDelayFor(weapon: WeaponType): number {
  if (weapon === "smallArms") return 0.025;
  if (weapon === "antiArmor") return 0.11;
  if (weapon === "airStrike") return 0.14;
  return 0.085;
}

export function dispatchBattlefieldAudio(
  events: SimEvent[],
  camera: Camera,
  screenWidth: number,
  screenHeight: number,
): void {
  let built = false;
  let produced = false;
  let credits = false;

  for (const event of events) {
    if (event.type === "combat") {
      const shot = spatialAudioForWorld(event.x, event.y, camera, screenWidth, screenHeight);
      if (shot.audible) {
        playSfx(fireSfxFor(event.attackerKind, event.weapon), {
          pan: shot.pan,
          gain: shot.gain,
        });
        if (event.weapon === "cannon" && shot.gain >= 0.78) duckMusic(0.82, 0.12);
      }
      if (!event.destroyed) {
        const impact = spatialAudioForWorld(event.targetX, event.targetY, camera, screenWidth, screenHeight);
        if (impact.audible) {
          playSfx(impactSfxFor(event.targetKind), {
            pan: impact.pan,
            gain: impact.gain,
            delay: impactDelayFor(event.weapon),
          });
        }
      }
    } else if (event.type === "destroyed") {
      const impact = spatialAudioForWorld(event.x, event.y, camera, screenWidth, screenHeight);
      if (impact.audible) {
        const cue = destructionCueFor(event.kind);
        playSfx(cue.kind, {
          pan: impact.pan,
          gain: impact.gain * (cue.heavy ? 1.2 : 1),
          heavy: cue.heavy,
        });
        if (cue.heavy || event.kind === "tank") duckMusic(cue.heavy ? 0.66 : 0.78, cue.heavy ? 0.28 : 0.18);
      }
    } else if (event.type === "sold") {
      playSfx("sell", { force: true });
    } else if (event.type === "repairStarted") {
      playSfx("repair", { force: true });
    } else if (event.type === "support") {
      const support = spatialAudioForWorld(event.targetX, event.targetY, camera, screenWidth, screenHeight);
      if (support.audible) {
        playSfx(supportSfxFor(event.providerKind), { pan: support.pan, gain: support.gain * 0.9, minInterval: 0.18 });
      }
    } else if (event.type === "built" && event.owner === 0) {
      built = true;
    } else if (event.type === "produced" && event.owner === 0) {
      produced = true;
    } else if (event.type === "credits" && event.owner === 0) {
      credits = true;
    } else if (event.type === "powerShortage" && event.owner === 0) {
      playSfx("powerShortage");
    } else if (event.type === "deadlineWarning") {
      playSfx("deadline", { force: true });
    }
  }

  if (built) playSfx("buildComplete", { force: true });
  if (produced) playSfx("productionComplete", { force: true });
  if (credits) playSfx("credits");
}

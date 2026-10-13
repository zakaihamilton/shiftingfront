import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  destructionCueFor,
  dispatchBattlefieldAudio,
  fireSfxFor,
  impactSfxFor,
  impactDelayFor,
  supportSfxFor,
} from "../../lib/audio/battlefield";
import { duckMusic } from "../../lib/audio/mixer";
import { playSfx } from "../../lib/audio/synth";
import { createCamera } from "../../lib/iso";
import type { BuildingKind, SimEvent, UnitKind, WeaponType } from "../../lib/types";

vi.mock("../../lib/audio/synth", () => ({
  playSfx: vi.fn(),
}));
vi.mock("../../lib/audio/mixer", () => ({
  duckMusic: vi.fn(),
}));

const play = vi.mocked(playSfx);
const duck = vi.mocked(duckMusic);

function onScreenCamera() {
  const camera = createCamera();
  camera.x = 400;
  camera.y = 80;
  return camera;
}

function combatEvent(overrides: Partial<Extract<SimEvent, { type: "combat" }>> = {}): Extract<SimEvent, { type: "combat" }> {
  return {
    type: "combat",
    owner: 0,
    attackerKind: "tank",
    weapon: "cannon",
    x: 6,
    y: 6,
    targetX: 6,
    targetY: 6,
    targetOwner: 1,
    targetKind: "infantry",
    destroyed: false,
    ...overrides,
  };
}

describe("battlefield audio mapping", () => {
  it("maps every weapon type to a distinct firing cue", () => {
    const weapons: WeaponType[] = ["smallArms", "antiArmor", "cannon", "airStrike", "antiAir"];
    const cues = weapons.map(fireSfxFor);

    expect(cues).toEqual(["smallArms", "antiArmor", "cannon", "airStrike", "antiAir"]);
    expect(new Set(cues).size).toBe(weapons.length);
  });

  it("maps impact and destruction cues by target domain", () => {
    const humans: UnitKind[] = ["infantry", "medic", "antiArmor"];
    const vehicles: UnitKind[] = ["tank", "harvester", "repairTruck", "convoyTruck"];
    const buildings: BuildingKind[] = ["power", "turret", "constructionYard"];

    for (const kind of humans) {
      expect(impactSfxFor(kind)).toBe("impactFlesh");
      expect(destructionCueFor(kind)).toEqual({ kind: "wreckHuman", heavy: false });
    }
    for (const kind of vehicles) {
      expect(impactSfxFor(kind)).toBe("impactMetal");
      expect(destructionCueFor(kind)).toEqual({ kind: "wreckVehicle", heavy: false });
    }
    for (const kind of buildings) {
      expect(impactSfxFor(kind)).toBe("impact");
      expect(destructionCueFor(kind)).toEqual({ kind: "destruction", heavy: true });
    }
  });

  it("maps support cues by provider", () => {
    expect(supportSfxFor("medic")).toBe("heal");
    expect(supportSfxFor("repairTruck")).toBe("repair");
  });

  it("delays impacts to follow their projectile weight", () => {
    expect(impactDelayFor("smallArms")).toBeLessThan(impactDelayFor("cannon"));
    expect(impactDelayFor("cannon")).toBeLessThan(impactDelayFor("antiArmor"));
  });
});

describe("battlefield audio dispatch", () => {
  beforeEach(() => {
    play.mockClear();
    duck.mockClear();
  });

  it("plays spatial combat and impact cues", () => {
    dispatchBattlefieldAudio(
      [combatEvent()],
      onScreenCamera(),
      800,
      500,
    );
    expect(play).toHaveBeenCalledWith("cannon", expect.objectContaining({ pan: expect.any(Number), gain: expect.any(Number) }));
    expect(play).toHaveBeenCalledWith("impactFlesh", expect.objectContaining({ pan: expect.any(Number) }));
    expect(play).toHaveBeenCalledWith("impactFlesh", expect.objectContaining({ delay: impactDelayFor("cannon") }));
    expect(duck).toHaveBeenCalled();
  });

  it("plays weapon-specific cues across unit and building attackers", () => {
    dispatchBattlefieldAudio(
      [
        combatEvent({ attackerKind: "infantry", weapon: "smallArms", targetKind: "tank" }),
        combatEvent({ attackerKind: "antiArmor", weapon: "antiArmor", targetKind: "tank", x: 6.5, y: 6.5 }),
        combatEvent({ attackerKind: "tank", weapon: "cannon", targetKind: "power", x: 7, y: 7 }),
        combatEvent({ attackerKind: "turret", weapon: "cannon", targetKind: "harvester", x: 8, y: 8 }),
        combatEvent({ attackerKind: "strikePlane", weapon: "airStrike", targetKind: "power", x: 8.5, y: 8.5 }),
        combatEvent({ attackerKind: "antiAirTurret", weapon: "antiAir", targetKind: "strikePlane", x: 9, y: 9 }),
      ],
      onScreenCamera(),
      800,
      500,
    );
    expect(play).toHaveBeenCalledWith("smallArms", expect.objectContaining({ gain: expect.any(Number) }));
    expect(play).toHaveBeenCalledWith("antiArmor", expect.objectContaining({ gain: expect.any(Number) }));
    expect(play).toHaveBeenCalledWith("cannon", expect.objectContaining({ gain: expect.any(Number) }));
    expect(play).toHaveBeenCalledWith("airStrike", expect.objectContaining({ gain: expect.any(Number) }));
    expect(play).toHaveBeenCalledWith("antiAir", expect.objectContaining({ gain: expect.any(Number) }));
    expect(play.mock.calls.filter(([kind]) => kind === "cannon")).toHaveLength(2);
    expect(play).toHaveBeenCalledWith("impactMetal", expect.any(Object));
    expect(play).toHaveBeenCalledWith("impact", expect.any(Object));
  });

  it("does not duck enemy fire relative to the player", () => {
    dispatchBattlefieldAudio(
      [combatEvent({ owner: 0, attackerKind: "infantry", weapon: "smallArms" })],
      onScreenCamera(),
      800,
      500,
    );
    const playerGain = (play.mock.calls.find((call) => call[0] === "smallArms")?.[1] as { gain: number }).gain;
    play.mockClear();
    dispatchBattlefieldAudio(
      [combatEvent({ owner: 1, attackerKind: "infantry", weapon: "smallArms" })],
      onScreenCamera(),
      800,
      500,
    );
    const enemyGain = (play.mock.calls.find((call) => call[0] === "smallArms")?.[1] as { gain: number }).gain;
    expect(enemyGain).toBe(playerGain);
  });

  it("plays a heavier destruction cue for buildings", () => {
    dispatchBattlefieldAudio(
      [{ type: "destroyed", id: 3, owner: 1, kind: "power", x: 6, y: 6 }],
      onScreenCamera(),
      800,
      500,
    );
    expect(play).toHaveBeenCalledWith("destruction", expect.objectContaining({ heavy: true }));
  });

  it("plays distinct wreck cues for humans and vehicles", () => {
    dispatchBattlefieldAudio(
      [
        { type: "destroyed", id: 4, owner: 1, kind: "infantry", x: 6, y: 6 },
        { type: "destroyed", id: 5, owner: 1, kind: "tank", x: 7, y: 7 },
      ],
      onScreenCamera(),
      800,
      500,
    );
    expect(play).toHaveBeenCalledWith("wreckHuman", expect.objectContaining({ heavy: false }));
    expect(play).toHaveBeenCalledWith("wreckVehicle", expect.objectContaining({ heavy: false }));
  });

  it("plays medic heal and repair-truck weld cues", () => {
    dispatchBattlefieldAudio(
      [
        {
          type: "support",
          owner: 0,
          providerId: 1,
          providerKind: "medic",
          targetId: 2,
          targetKind: "infantry",
          amount: 12,
          x: 6,
          y: 6,
          targetX: 6,
          targetY: 6,
        },
        {
          type: "support",
          owner: 0,
          providerId: 3,
          providerKind: "repairTruck",
          targetId: 4,
          targetKind: "tank",
          amount: 20,
          x: 7,
          y: 7,
          targetX: 7,
          targetY: 7,
        },
      ],
      onScreenCamera(),
      800,
      500,
    );
    expect(play).toHaveBeenCalledWith("heal", expect.objectContaining({ minInterval: 0.18 }));
    expect(play).toHaveBeenCalledWith("repair", expect.objectContaining({ minInterval: 0.18 }));
  });

  it("plays credit, power, and deadline cues for the player", () => {
    dispatchBattlefieldAudio(
      [
        { type: "credits", owner: 0, amount: 40 },
        { type: "credits", owner: 1, amount: 40 },
        { type: "powerShortage", owner: 0 },
        { type: "deadlineWarning", remainingTicks: 360 },
      ],
      onScreenCamera(),
      800,
      500,
    );
    expect(play).toHaveBeenCalledWith("credits");
    expect(play).toHaveBeenCalledWith("powerShortage");
    expect(play).toHaveBeenCalledWith("deadline", { force: true });
    expect(play.mock.calls.filter((call) => call[0] === "credits")).toHaveLength(1);
  });
});

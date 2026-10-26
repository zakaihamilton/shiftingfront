import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  // Equal-cost routes hold one 8-way heading instead of stair-stepping.
  // Digests also include the zeroed scout production counter.
  // Outpost guards defend in place, so assault openings include their shots.
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "ed6960a4243050f226d595ef26036824c2fa62d65ed97e27a5e87682c5d1ffbe" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "8e60c277293002cf002551f8555dcfe7ed0777d255de67252f6c9a16bf987b23" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "71b9c982c5c8604847d9c93251a08f2f532d726dd8953c197fcd078b7ce40713" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "54df469ce90c3d7e956921ae5b65ea0e4b16be374ba94c2213cc4d406cd2248d" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "8c550a4034f5d06828613d575acfbb91bf3103eeabaa22cff262d94732a93fce" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "88ccf8a2b8a994b293d1db057e9dad5ea1f514a0f3339bd6a9a966149f6ffeb4" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "9b4bb810d3779aaa15ff40e3859ed7891f80aebe3ba7ad789094d4682b2ef942" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "99fca50405fb9cb5422e0b1a943143fac563337ff661be4e7f1c6eed5f079448" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "d0abd70a89edbc01625edf9894837f02136f880869f6ccba5e13f92dceab15f0" },
  // Rescue corridors now join the map route-repair pass used by extraction.
  { kind: "rescue", seed: 0, missionIndex: 0, digest: "af663da977a03c1f4d42db9b39379c033da80855126ccec586479d8e013d650b" },
  { kind: "sabotage", seed: 1, missionIndex: 0, digest: "18ae0cea2e69f122ca5f671e2d8c6aee15d04a8d409a834238c02e4f7089d29a" },
  { kind: "structureQuota", seed: 2, missionIndex: 0, digest: "eeaf237cdbd17ddadf3fd39c57da8bf78d58a83f288eff9a4181e599bea33bbc" },
] as const;

describe("replay compatibility baselines", () => {
  it("keeps representative fingerprints stable across every mission kind", () => {
    for (const baseline of BASELINES) {
      const replay = runReplay({ seed: baseline.seed, missionIndex: baseline.missionIndex, maxTicks: 120 });
      const digest = createHash("sha256").update(replay.fingerprint).digest("hex");
      expect({ kind: replay.state.win.kind, tick: replay.state.tick, result: replay.terminalResult, digest }).toEqual({
        kind: baseline.kind,
        tick: 120,
        result: "playing",
        digest: baseline.digest,
      });
    }
  });
});

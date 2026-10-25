import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  // Digests include the zeroed scout production counter.
  // Outpost guards defend in place, so assault openings include their shots.
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "e72a2e671e9549fab8289e8b5c23d1ea9456ddd8c401094f9f00884cf286dc6e" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "7bee95e5d57cc2910b2c1d713f5f6be73e5c319cb61b65cf2dfd78dfbd144ef6" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "f4ef6746634ab141d1d969bd3a28eb6f7b3abe49eab53941cfe5a5b3d5c7c480" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "11136c0e671d86169e0159a67788b869f4a6bc6a6bbccaeceb9794b902e254fe" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "9cfb499fcb98cd760b2fe552f0b965b7b819b9785b063380b791d86d1ca63a0d" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "2dbe887a9777d480a9f008c51a1e78f3d2850ba0c5f6cbcde6996d6ae68e7ebe" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "f3006cdc7d5e57c33faa195814cde3e671ed109097d25c384a474371a9a419c6" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "16fbd0b955a0e70df7e15354e75b5a5ce9984342e12e0096171fbcb4d80db75e" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "5039ddf135c410e8d09355cfede26170e93ae6f3f12af61b7dfeb086b5d1805b" },
  // Rescue corridors now join the map route-repair pass used by extraction.
  { kind: "rescue", seed: 0, missionIndex: 0, digest: "4eadb8d9f0007f0bbebb7ce9ba2240599f22ec799be089c7300d33d9784352d0" },
  { kind: "sabotage", seed: 1, missionIndex: 0, digest: "8ff46ee1c7cf8f4385a956fa8ad73c4102ee83265d0f1710f367430d878619cb" },
  { kind: "structureQuota", seed: 2, missionIndex: 0, digest: "a07ec60df9018ff00f479623da3c3daee999edb7138f2a25a6b97b94ddd6fbc6" },
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

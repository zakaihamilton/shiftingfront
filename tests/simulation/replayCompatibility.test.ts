import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "79b0dd0c032d145042b13bd593ef7fb779a4ca2298903d460098b9092bf393cd" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "d9da2736e22cc551142d59654f732c7259eea9e04c3315bf3f0344868578e093" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "e373abac9565eb3d2f621f91df8348af44df71f453a3d8985654f18579d6fc89" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "ba194c59ea2520bf0609acd8839fce1a28220d00ac1ae2f39eb0ff1b0ac0adbb" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "926ced7c36e50736a411e92cf00b68fbd7da3b91c88b6b7208a119d0f8179a29" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "d45170aaab873d37a0d273e69e1985819c6be8ad335ac11d2c2d18b39957cb57" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "ab028a7a26ab35093c77f1c69f7fed3da9f74f0394122b4576212787f31e265e" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "ee535d46f067153dcebfe799cd646de4539b574d4bd30faf2bf1ea9bbb13266c" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "a9fba8df1728f689f39fe1883d920e7f54b999a2852ded2f614ee7791bafef89" },
  // Rescue corridors now join the map route-repair pass used by extraction.
  { kind: "rescue", seed: 0, missionIndex: 0, digest: "a324eb755904e82a3e1b7d349a97a53b8560162dd358cfaad7d4cff0f91727bc" },
  { kind: "sabotage", seed: 1, missionIndex: 0, digest: "94f9ec4531d95487df6fda648dd34270cfeb4863998a71c1f71cfb537f4146e6" },
  { kind: "structureQuota", seed: 2, missionIndex: 0, digest: "93c9a91399d6227063cc2455121c3dcea0957e036826677730c0ad9bfd282879" },
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

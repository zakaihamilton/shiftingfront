import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  // Outpost guards defend in place, so assault openings include their shots.
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "5ce7f19cb260701d3ce2cced205d69a2f9e3e455d0003d5932a66049a1d07f08" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "319e61b6afabdee535adfb550fe2c020091e0b1361bf88c3a4a41064be99ef25" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "040e0ab2d46482fdd38fdea25f649604128dd79f52f4ee5fb66f465ba0d3d596" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "abfa5b84ccc8bcd525aa81cff90f73bf505df1e5e0dc6c808e9b04025cfff337" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "c05ca53193a91d6b17732c556c9ffd365fe3b1cc3ff2f40a674b1a45d72b7493" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "2a5d747c035a86ff858b7b54ae749ac4b957d351007cb643d9687acf209c990e" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "4b66bf7ffcd981b8609dbee6ea05eafda2f9524910e8b239414fe47f140280aa" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "49a8aed356d1f64f4dfc4f78da84c9e2ac34ba0571369f4e59526d9a65f3334b" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "01a2db3a33eb09c6f533cde71c9eb0de001ca113828ac745dfe6a903a5c6a580" },
  // Rescue corridors now join the map route-repair pass used by extraction.
  { kind: "rescue", seed: 0, missionIndex: 0, digest: "27aea816bcca993be4602bb5d2540101b762dcaa4cd6dd244d9e122793c8f1fb" },
  { kind: "sabotage", seed: 1, missionIndex: 0, digest: "09bea72f51827fadfac486078ca0d2c80783cb13d0bc3506abe882284ea4c157" },
  { kind: "structureQuota", seed: 2, missionIndex: 0, digest: "3d43a5a318be99dce37619c20cfa51a9a9717562dd76c959cabe3907c3948545" },
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

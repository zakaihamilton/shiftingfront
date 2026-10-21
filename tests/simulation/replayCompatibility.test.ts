import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "18d8351831f0cbc5bcdcb28cae29aac39be025ba360a9b3624cb76d36b51a7ed" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "14e67fd02eb43dd166d14b6302601f3af46030014bc4e75099729b172fc433ba" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "513c18c9f9c8e33fedf08c8e64cb6c87b1e44ad8f27c87b3d9c40b034140d794" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "abfa5b84ccc8bcd525aa81cff90f73bf505df1e5e0dc6c808e9b04025cfff337" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "c05ca53193a91d6b17732c556c9ffd365fe3b1cc3ff2f40a674b1a45d72b7493" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "2a5d747c035a86ff858b7b54ae749ac4b957d351007cb643d9687acf209c990e" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "4b66bf7ffcd981b8609dbee6ea05eafda2f9524910e8b239414fe47f140280aa" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "49a8aed356d1f64f4dfc4f78da84c9e2ac34ba0571369f4e59526d9a65f3334b" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "8f7df869ae89cc80e8b29abb495ae557cc70381dae9e6d41ca8c49447b5b82ea" },
  // Rescue corridors now join the map route-repair pass used by extraction.
  { kind: "rescue", seed: 0, missionIndex: 0, digest: "27aea816bcca993be4602bb5d2540101b762dcaa4cd6dd244d9e122793c8f1fb" },
  { kind: "sabotage", seed: 1, missionIndex: 0, digest: "e5131280bc0dae7689fe0e9fe84249d973446e9a5cde15d552dd19e9396821f3" },
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

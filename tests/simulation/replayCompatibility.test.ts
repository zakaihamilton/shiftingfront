import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "6f07e50f0d1145a761455588a58b773528d24da26a324b591211d65a84925b74" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "2103df589ed3a521b67090524d5444789f25a3da87a84c5307fd4749ba89c747" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "df40bcea51feb5933019b2250d0e9b879eb24c5c1dde96164ccb10c803386cab" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "926f7493f84e2e739ebdf79c419a0a90b5173a53dba64ce65e6bb1673dcebb5e" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "9a144984c8ff1f837016440ef20fb48af87ee2720176ce70277e971c05b84edf" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "4cea64dcb84f4459efabc70c1523a55002ab82833d3b2c6d5c87e387a49f27b6" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "55ec1b34e68d97593f761b7c5ad8393f7ca3012f010aa6a76c70ac308b520cb2" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "5f7b0de66989ee02207c55f00be5d7a70656905197b03490934ff48d26656516" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "0dfbfa4769d33b337ab2ca91df7ed5e5b142721fd0672c95773ad1edac34649d" },
  // Rescue corridors now join the map route-repair pass used by extraction.
  { kind: "rescue", seed: 0, missionIndex: 0, digest: "a04e2d8153e566d85b961b37d11001fb50c3689082f904cad060bacaa81cb020" },
  { kind: "sabotage", seed: 1, missionIndex: 0, digest: "c06951fa3b78e15dda7ed9df95f7d4b6e518182a2aaf8a3e784b98b9d8ec5676" },
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

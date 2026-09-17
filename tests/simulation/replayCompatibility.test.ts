import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "efc76f16595865cf907e333797cb8358fe7e8051f4a78c23a144a342c9721278" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "37cd3e92a0b57456d404c367d6c6c1424f82e6c40d7d2857505e31e162525b7d" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "f4fec5449f3944183cd809d02537d41dcacb8d934437ac608608a93baa7fa59b" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "fadc0839f80e367ecad7cd3946fe82c5de48a628ddc18bbc87590e864c42dfe7" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "cd2e63bf984cd3acdcb40f44261c9545f480af75093e9fba41ca0e1f6106aff7" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "1c5b7c92e8a3512904abaaf469937aaff0de4f03175fb3ff8f0b045e5f3d9419" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "d275623abaf57487a46501f88b3b9df0dd1df3ebca39e6d751fadfb7e7361b3b" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "eb2068d398b8b161b19fc3e9f6e1aafcbc287cd0e1c505c740cb610665ee10ff" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "bdf447f63e3b2d74c1d421c498d2e7e44873b636d9a653b67e1dbe368b5eef94" },
  // Rescue corridors now join the map route-repair pass used by extraction.
  { kind: "rescue", seed: 0, missionIndex: 0, digest: "d38171cd6e2af994bbc5ef8b33c60bd3868ee5a52ad83e73b49401696a306a1d" },
  { kind: "sabotage", seed: 1, missionIndex: 0, digest: "5462ae69f7efe75f67149dbfbba9778ee039b5167cf2a5c4b96e400c33ec8669" },
  { kind: "structureQuota", seed: 2, missionIndex: 0, digest: "fa9c292c2ce3065088b06a8c4bdda42d2852453326b9fce32959c33d4c634597" },
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

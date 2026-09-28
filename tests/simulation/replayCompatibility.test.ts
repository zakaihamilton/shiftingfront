import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "7c75ca172fec307ec0479991804a3ddeb9a3aa72436b38963034afdedbf8e565" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "4b92ef2cfd0493fc0ccd156098738e4e56fd0529493a292a8d69a6689af31bb0" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "35537f69dbe6a0b9239112ade8b18f28b60aeb671bcfc105bd8ac07478f788e0" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "c3bb841d6df9b61224fcc8cca14430f1f42f22077b82e26bd26d01ca96a0da4a" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "cdaaf8b47dbc97eb20e8bc506524ec5b84eab3c5ab750214476df43d6ecb5aa2" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "5239514bb1ccb32146b93a10c50adc9d3666e2e1427db6c0b904becc5b251dc4" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "d2ef1a796cf88d52190402f7498979bf461d98e9b7da5a8d5d9f0abc531c3314" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "4198f29a08756faaa523bb37830470c40a1168e1fcd41bd99800ce8e699b0fcb" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "5268921f7100d8fe69fb052573ebed1bdd5a4c8f034f8938b56cb00383bae9de" },
  // Rescue corridors now join the map route-repair pass used by extraction.
  { kind: "rescue", seed: 0, missionIndex: 0, digest: "a0952d72a4a6471c74977c3d33fd02ea6bcc967fc91ccc16ca786d8560e6e024" },
  { kind: "sabotage", seed: 1, missionIndex: 0, digest: "4d4f91b5c0d6c5e76fa88c5834a38c3217211f5bb6c22f675334b2485580c349" },
  { kind: "structureQuota", seed: 2, missionIndex: 0, digest: "e464becf5f2b68f073a76366ee0f0bdeb5425eed68cd14b82df76bed123bf2bc" },
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

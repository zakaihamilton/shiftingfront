import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "0dc234e3b446230a3d8f2631a63dc7fe1ca13b513dd0cae191ddb3d01c5b5d1a" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "1ccee25db4398dcf51588f8f05adfd610182617ca122f671bf1a01e516d2fb93" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "b21ff9dcbf0a78c6da256d060d0e8133d153960de167857ff8658adfc3b20767" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "970317a0d37e66a5ae319b5e57bb078826a49ad3a8f7f4f53efe7a9e552f95ad" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "f4e3c82062d5002eb6dc2ace0e950e26244af69776b752d941df37d06d86fe3f" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "7ba96d70b0c7da0a5fb39cd9567a17d933e71c019c14b239adec9a667e3f77e6" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "cce12fdbe542e8cbad865b27193160cec4b1222e1266438b3d4d39f853b5abf7" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "961b1bbf4ca3a98e350452e05c764645a2ccbb3b481e9d187d8b868242070bc6" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "a757b03a779f9fb1f73cd0847de4370f475263bbec12d5cc3bc53ca46c0fa537" },
  // Rescue corridors now join the map route-repair pass used by extraction.
  { kind: "rescue", seed: 0, missionIndex: 0, digest: "9e87686c93570871e23a61b1f38290d2d80797fe71dd83d084df9bb89bcc02aa" },
  { kind: "sabotage", seed: 1, missionIndex: 0, digest: "ce7045252ba4772ccf38846c615bdd531de595e6ae4aa606131e4bcc6b986688" },
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

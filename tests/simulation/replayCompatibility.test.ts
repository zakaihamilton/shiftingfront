import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "db47b31212717778abd7617541870b919325995f678881fe1993e395af35bdc9" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "a90a26be1e6255b7d0e565ea8626fa1fa51bb5af2814d3bd830da2254619d9a4" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "489ad4a2f6a002e306953170dfb03ad047cd7db20a2b8be3591e9f879c2fe878" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "2f0aaff85c86f7f587930932938a95755b34db6325b602acfe738f991af7609c" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "d4860e87325be877e78722b99c4e7023f00ec873998ff1c32c4f55ea3f54f8c0" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "b6e7b09812c71c8080948b9c3a786f3835267f2527a954a0bf8dde2cda2b12d5" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "c2b006758b91d00a7547e3e2f70e8740ce1414dfa1790bf47be1aef019fba0fa" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "da67ea27a7280166a2b091d4dfc8dedf4470dc953bad003feb48c3962a37fa1c" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "0625634641049f5bf72e591b1c96f7dd5b9da5057d95704c263135d3dc247310" },
  // Rescue corridors now join the map route-repair pass used by extraction.
  { kind: "rescue", seed: 0, missionIndex: 0, digest: "78e3873772c47b9ad2ae5d0ca6fc3662090c259112c3e1a0df5bb0d7f80f9def" },
  { kind: "sabotage", seed: 1, missionIndex: 0, digest: "3ba9674a61914bc53d4324ea7184b07172659a4ef518d25254f5ec9ea024c97e" },
  { kind: "structureQuota", seed: 2, missionIndex: 0, digest: "730c54eba5f2ce08a7a0f37fbb3c9cd259b094152bb46c704d61909971014435" },
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

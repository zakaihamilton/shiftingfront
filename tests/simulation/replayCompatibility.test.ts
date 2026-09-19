import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "010d4149d60f3666873312b3441554dd28635d2904d493a9a11b4989008c3502" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "33dd9a1a53dfcbea520ff8ad74a3ff81469029c180a67143f2d5355ba4eda89c" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "e9b4a2903946428f8291652a18041dc7e0c0badfdb69d65c21cccf44738488f2" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "3bc66b1e151497878b86343d462359bbc4e28d850e6ff4406c3fbf2c9f450ddf" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "d62e6c19274257f4ea79f71603f9a0258e0b78a18ec70c78d346305681c2005f" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "175dcf4985cdc698d742f9c31a4033c0dc6b8aa0801d3c70f8ac9308a402a46b" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "9d0b6e9e4107bc2c68ae2d4ce49cf89041407227c7b5ce7a610544fa73e4c541" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "cbd8bc1ec86b11b314c496301eb32f266770f0a60b76f0541a1a89454b4c6ae3" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "8091be65f6ec6013057a602239dda8983746c4ebed998fbaae53c3619aede29c" },
  // Rescue corridors now join the map route-repair pass used by extraction.
  { kind: "rescue", seed: 0, missionIndex: 0, digest: "3a2888587a83536f068bb740e1b5291abcea1678f84f49b1cfbe9323fd3e590e" },
  { kind: "sabotage", seed: 1, missionIndex: 0, digest: "a5aa0c5a78755c03338327d172fc2cf1d825e3f43e7808a983eac1b66ed9a387" },
  { kind: "structureQuota", seed: 2, missionIndex: 0, digest: "6f8839cd949fc4f98e1cbcdd927668607d2b108789a6016ae33d68851df2cdbe" },
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

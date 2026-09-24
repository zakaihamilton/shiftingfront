import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "20fd789df778d14612d7609dc1bb686a65242edcff58b0c46857d87eba88a0b9" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "c297c3075a86bb729c8319db37deaf9ea647484f0974cb9de2c5ae54aadebe9f" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "a17b00cbfc0790d68f1542a9a16af23ee6dc32e54faf436995c83a5ee97d9201" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "d16b91a6ad2f10370815d4b3a5e8bb51ed9d07546a1835e3429f749f43890dda" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "cf17a59a1478e8760024385e12eb4797e8573d8fe063ae6c09606a8fe39f31a2" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "fae58dd21f037677a38b4315af44af4979d91cc307fd02163deb798ffd63fda3" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "ab0162264b0338065420f43cd13cb2f5a5d09e86de65eb9289c680c94aae28d4" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "1b2ed03cada8ca7fdf8901f3e05cf78bbc2f7435261e39bf11a0ce6011de4b3f" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "242c523438cee1be22b7a53c6ae929ff221daaf5e104a33d615a04ac38c0f3b2" },
  // Rescue corridors now join the map route-repair pass used by extraction.
  { kind: "rescue", seed: 0, missionIndex: 0, digest: "6b3812e04027e295957ad17552bb6408aec2b923fb254817f696a0f35bfb194f" },
  { kind: "sabotage", seed: 1, missionIndex: 0, digest: "445e6ab7fede9415af4c7a660354b2b6f20d11079927802ce185361330d4847a" },
  { kind: "structureQuota", seed: 2, missionIndex: 0, digest: "09210a6076aea89b6b4c841917a8cdcd52482b0f1149ff016d5fba43294fa96d" },
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

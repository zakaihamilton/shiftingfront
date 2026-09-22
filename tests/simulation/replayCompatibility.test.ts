import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "9ca84cb7ba9986493d6fc35384433262d5c6991d1dbf0e1d88d931d291b2513c" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "a014b09e9051a8d9281780f8d6f59b5ec2cafa6505f6bfb34fc6d8a4bb600ed3" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "af6cabcbe5ff315c04c41cfd29ed1e2889d9df0ed7a38e947633d3934111e0f7" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "6fddfaa6e9bb28019dc08e0c2101cdd46b0db293cd85cbf0b4083fd9c373ec69" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "1d0c01a526279e061a95f2b30880386380a59c64d313577f75b63a90ba54a383" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "1190e418aa0f42e93921c312b8b6494234b431d3bc93999695c40793d5eb6cf9" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "64e5e840f3bc75147b64297db359c03d49de59258adce23b6c70a9b6268ab8ba" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "5d525a3f45bd5c631d335248c07ed486c79bdecd153e95c537fc7026f98c8bac" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "51643e35524840b367d2f936a08a1a30528c25166f2e67148f5b035aa77d7f9f" },
  // Rescue corridors now join the map route-repair pass used by extraction.
  { kind: "rescue", seed: 0, missionIndex: 0, digest: "03f680fad20feeb5d7f9533ef94089fe6c064bc99aa5f4b2e22bf871cb55a552" },
  { kind: "sabotage", seed: 1, missionIndex: 0, digest: "ccec4a430c53a1fb35b05f63089621c92d51a6e1b19e979fccee4ea720b6d028" },
  { kind: "structureQuota", seed: 2, missionIndex: 0, digest: "fd3f3325426a9a475c2caea9bd6f8cdd9dd1b6841406948b6bd00108c6014810" },
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

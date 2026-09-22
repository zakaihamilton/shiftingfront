import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "1ef8c04c5a65b4d6bbe4b8248adb93430be0f9842d25b5a7769f2fa376bac9ad" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "7ca51da72e2852fdc74cfcf4a37e3d9279846074d6986eacf6577c48b50cd6ed" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "ab028ca727baebeae1b132fe34a2c3d114d6b626c9491041a733e3fda0b7ffd3" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "6fddfaa6e9bb28019dc08e0c2101cdd46b0db293cd85cbf0b4083fd9c373ec69" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "6c7e4705b9a21ab937a717fdc0fcc056848508f4d2df29b0174e6114045f6837" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "a9e40960afda47a47da1473ea3cc36825d759ff1a16b8207d53ae52a217b4187" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "cd132c6b4ceb6c711071a41211dd1e271a1f8aecb00d5a9ca1497a323f86ecd0" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "803dcd355feca9f89ec5b5f59cee7b5acc9d9f1576afd5ba2a62e676e9c89273" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "d46cb892bdfbe497d17ee947d68bdcf1adabf59df0ea4179fb00fa493ddb4766" },
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

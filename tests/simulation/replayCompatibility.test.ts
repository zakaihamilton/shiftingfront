import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  // Screen-cardinal steps walk the diagonal directly, and open routes keep one turn.
  // Outpost guards defend in place, so assault openings include their shots.
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "43e542a7e0e206c8a9b957207249f617d49bb07f7dd27837dcbf4be2d12a0690" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "b33a97cfaf16d862c17a9a35f57c311c643589acc827e9009deb8eacdd120853" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "c371b3e8758e3ada2a5c0fcd10829ffeb24f0732b4b17f6b1857495052ac9733" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "ff1cfb2df5b3c09134238901449f010741b3a29f7b189288bcf51bf5911060dd" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "88034b34fbf1398652145fbf42403155187d6608a28c30ea005c2da2bd7520bc" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "0fed9026b4ab314d3e58bdd5a851874182561cf48485c75fdf6daa546d6e8904" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "706f3a91dfca8c124b0d7c99c224e882fae8045e6114b31bba92621ecbb9d18c" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "eb040caf5e6b7284d3a05b4f6941ac4e9f32aca2a998d2af38e2507463212ed8" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "c34d5df6713b08680c733454dee069771e48db10a99cb35c66a51ca5ef615b3c" },
  // Rescue corridors now join the map route-repair pass used by extraction.
  { kind: "rescue", seed: 0, missionIndex: 0, digest: "606cef22d9e937a3b3da4c37bd47cc505cde343a5b36c7b99220ee16d4408d0c" },
  { kind: "sabotage", seed: 1, missionIndex: 0, digest: "37b2589f3fdc35bd7fbaaa98216dcf906cddcf6b4a02d6873972d389eaba69bf" },
  { kind: "structureQuota", seed: 2, missionIndex: 0, digest: "180e82483df98d829a0532fc50e71d35bbfb0f477ddf9dbb4be278bf5bb7ed57" },
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

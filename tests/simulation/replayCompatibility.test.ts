import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../lib/sim/replay";

const BASELINES = [
  // Screen-cardinal steps walk the diagonal directly, and open routes keep one turn.
  // Digests also include the zeroed scout production counter.
  // Outpost guards defend in place, so assault openings include their shots.
  { kind: "annihilate", seed: 1, missionIndex: 2, digest: "84a142b35a5ca9c7206975be9ab796bccbf95dfcdac408d0f6bb03f507a95004" },
  { kind: "decapitate", seed: 1, missionIndex: 4, digest: "dc54429cae699bb1b120402615eacf46ed8c608122544bdf5b1251c3cb78fa81" },
  { kind: "destroyMarked", seed: 0, missionIndex: 3, digest: "4110790666b658b1a3835fec4e3b7acf49443c95882a0b1e1cfabe4603033570" },
  // Escort includes the expanded completion buffer and convoy unblocking path.
  { kind: "escort", seed: 0, missionIndex: 2, digest: "54df469ce90c3d7e956921ae5b65ea0e4b16be374ba94c2213cc4d406cd2248d" },
  { kind: "extraction", seed: 0, missionIndex: 1, digest: "10629a62f9bd9d0eb1d7435733063244cdd4351f7c1e7eef733b5d49b24d5226" },
  { kind: "forceQuota", seed: 0, missionIndex: 4, digest: "130ba3c0f7dfe3862d906fd887b2c6bb9b81865389ff965bf1b87079e40fc24b" },
  { kind: "harvestQuota", seed: 7, missionIndex: 3, digest: "9e1ec8e6a8346d1832d103ec8030e4113dbf7451bf5f0314ab4ba6b710c2a575" },
  { kind: "holdTheLine", seed: 0, missionIndex: 5, digest: "5ecaeade2b9531b373aef66d8df52e0903a28a95e22863a6610b58eed452bc7e" },
  { kind: "razeAll", seed: 3, missionIndex: 2, digest: "1dc920fd2b53f487c93fddf354672ede98d0d52e3a8eaddb3eef161d56906d4b" },
  // Rescue corridors now join the map route-repair pass used by extraction.
  { kind: "rescue", seed: 0, missionIndex: 0, digest: "bd3d44c0ac05b1c467c3d81242af04d23ef96d8cf989b14045203f9d666f86aa" },
  { kind: "sabotage", seed: 1, missionIndex: 0, digest: "18ae0cea2e69f122ca5f671e2d8c6aee15d04a8d409a834238c02e4f7089d29a" },
  { kind: "structureQuota", seed: 2, missionIndex: 0, digest: "6460974e861c9082678c263265e5d51a76ee058778e6f4acd5992ee51e4a0ca0" },
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

import { describe, expect, it } from "vitest";
import { decodeRle, encodeRle } from "../../lib/persist/save/rle";
import { deserializeState, serializeState } from "../../lib/persist/save/serialize";
import { createMission } from "../../lib/sim/api";

describe("RLE compression", () => {
  it("encodes and decodes flat numeric arrays", () => {
    const data = [0, 0, 0, 1, 1, 2, 2, 2, 2, 0];
    const encoded = encodeRle(data);
    expect(encoded).toEqual({ encoding: "rle", runs: [3, 0, 2, 1, 4, 2, 1, 0] });
    const decoded = decodeRle(encoded, data.length);
    expect(decoded).toEqual(data);
  });

  it("handles edge cases: empty array and uniform array", () => {
    expect(encodeRle([])).toEqual({ encoding: "rle", runs: [] });
    expect(decodeRle(encodeRle([]), 0)).toEqual([]);

    const uniform = new Array(500).fill(7);
    const encoded = encodeRle(uniform);
    expect(encoded).toEqual({ encoding: "rle", runs: [500, 7] });
    expect(decodeRle(encoded, 500)).toEqual(uniform);
  });

  it("round-trips a run pattern whose pair count equals the source length", () => {
    const data = [1, 1, 2, 2];
    expect(decodeRle(encodeRle(data), data.length)).toEqual(data);
  });

  it("transparently decodes string format and legacy uncompressed arrays", () => {
    const uncompressed = [1, 2, 3, 4];
    expect(decodeRle(uncompressed, 4)).toEqual(uncompressed);

    const strFormat = "3x0,2x5,1x9";
    expect(decodeRle(strFormat, 6)).toEqual([0, 0, 0, 5, 5, 9]);
  });

  it("dramatically compresses save state JSON payload", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    const serialized = serializeState(state);
    const parsed = JSON.parse(serialized);

    // Tiles and heights should be compressed as tagged run pairs
    expect(parsed.tiles).toMatchObject({ encoding: "rle" });
    expect(parsed.tiles.runs.length).toBeLessThan(state.width * state.height);

    // Round-trip must be byte-for-byte identical on map arrays
    const restored = deserializeState(serialized);
    expect(restored.tiles).toEqual(state.tiles);
    expect(restored.heights).toEqual(state.heights);
    expect(restored.surfaces).toEqual(state.surfaces);
    expect(restored.resourceAmount).toEqual(state.resourceAmount);
    expect(restored.fog).toEqual(state.fog);

    // Compare against uncompressed JSON payload size
    const uncompressed = JSON.stringify({
      ...state,
      tiles: state.tiles,
      heights: state.heights,
      surfaces: state.surfaces,
      resourceAmount: state.resourceAmount,
      fog: state.fog,
    });
    const compressionRatio = serialized.length / uncompressed.length;
    expect(compressionRatio).toBeLessThan(0.3); // >70% size reduction
  });

  it("enforces a hard payload budget ceiling on serialized saves", () => {
    for (const seed of [0, 421, 1337, 9999]) {
      const state = createMission({ seed, missionIndex: 5 });
      const serialized = serializeState(state);
      // Hard ceiling: Must remain under 64 KB (providing ~75x safety margin under 5 MB quota)
      expect(serialized.length).toBeLessThan(64 * 1024);
    }
  });
});

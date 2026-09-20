import { describe, expect, it } from "vitest";
import { composeMusic } from "../../lib/audio/compose";
import { indexPattern, layerMultiplier, stemBus, type MusicGraph } from "../../lib/audio/musicGraph";

describe("layered music graph", () => {
  it("indexes the harmony stem alongside the existing lanes", () => {
    const pattern = composeMusic(421, "mission", 3);
    const index = indexPattern(pattern);
    const first = pattern.notes.harmony[0];

    expect(index.notes.harmony).toBeInstanceOf(Map);
    expect(first).toBeDefined();
    expect(index.notes.harmony.get(first!.step)).toContainEqual(first);
  });

  it("routes harmony to the dedicated harmony bus and keeps it below the lead", () => {
    const harmonyBus = {} as GainNode;
    const graph = { harmonyBus } as MusicGraph;

    expect(stemBus(graph, "harmony")).toBe(harmonyBus);
    expect(layerMultiplier("harmony", "calm")).toBeLessThan(layerMultiplier("melody", "calm"));
    expect(layerMultiplier("harmony", "critical")).toBeGreaterThan(layerMultiplier("harmony", "calm"));
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFixture } from "@/lib/sim/fixtures";
import { bakeTerrainAtlasData, makeAtlasKey } from "@/lib/render/terrainAtlasBake";
import { bakeTerrainInWorker, disposeTerrainWorker } from "@/lib/render/terrainWorkerClient";
import { getTerrainAtlasAsync, invalidateTerrainAtlas } from "@/lib/render/terrainAtlas";
import type { TerrainAtlasData } from "@/lib/render/terrainAtlasBake";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  messages: Record<string, unknown>[] = [];
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  postMessage(message: Record<string, unknown>) { this.messages.push(message); }
  reply(atlas: TerrainAtlasData, index = this.messages.length - 1) {
    const request = this.messages[index]; this.onmessage?.({ data: { id: request.id, generation: request.generation, atlas } });
  }
}
afterEach(() => { invalidateTerrainAtlas(); vi.unstubAllGlobals(); vi.useRealTimers(); FakeWorker.instances = []; });
const fixture = () => makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });

describe("session terrain worker", () => {
  it("runs the actual worker bake with exact fallback pixels and transferable buffers", async () => {
    const state = fixture(); const expected = bakeTerrainAtlasData(state);
    let receive!: (result: { atlas: TerrainAtlasData }, transfers: Transferable[]) => void;
    const result = new Promise<TerrainAtlasData>((resolve) => { receive = (value, transfers) => {
      expect(transfers).toEqual([value.atlas.data.buffer, value.atlas.waterCells.buffer]); resolve(value.atlas);
    }; });
    const scope = { onmessage: (() => {}) as (event: MessageEvent) => void, postMessage: receive };
    vi.stubGlobal("self", scope); await import("@/lib/render/terrainWorker");
    scope.onmessage({ data: { type: "bake", world: structuredClone(state), grainGeneration: 0, id: 1, generation: 0 } } as MessageEvent);
    const actual = await result;
    expect(actual.data).toEqual(expected.data); expect(actual.waterCells).toEqual(expected.waterCells);
  });
  it("copies inputs, rejects obsolete requests and ignores stale replies", async () => {
    vi.stubGlobal("Worker", FakeWorker); const state = fixture(); const controller = new AbortController();
    const first = bakeTerrainInWorker(state, 0, controller.signal)!; const failed = expect(first).rejects.toHaveProperty("name", "AbortError");
    const worker = FakeWorker.instances[0]; const snapshot = worker.messages[0].world as typeof state;
    expect(snapshot).not.toBe(state); expect(snapshot.tiles).not.toBe(state.tiles);
    state.resourceAmount[0] = 4; expect(snapshot.resourceAmount[0]).not.toBe(4);
    const second = bakeTerrainInWorker(state, 0, controller.signal)!; await failed;
    worker.reply(bakeTerrainAtlasData(snapshot), 0);
    worker.reply(bakeTerrainAtlasData(state), 1);
    expect((await second).key).toBe(makeAtlasKey(state, 0));
  });
  it("cancels requests and terminates on disposal", async () => {
    vi.stubGlobal("Worker", FakeWorker); const controller = new AbortController();
    const pending = bakeTerrainInWorker(fixture(), 0, controller.signal)!;
    const failed = expect(pending).rejects.toHaveProperty("name", "AbortError"); controller.abort(); await failed;
    expect(FakeWorker.instances[0].messages.at(-1)).toEqual({ type: "cancel" });
    disposeTerrainWorker(); expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
  it("falls back after a worker loading failure and disables retries for the session", async () => {
    vi.stubGlobal("Worker", FakeWorker); const state = fixture();
    const prepared = getTerrainAtlasAsync(state); FakeWorker.instances[0].onerror!();
    expect((await prepared).data).toEqual(bakeTerrainAtlasData(state).data);
    expect(bakeTerrainInWorker(state, 0, new AbortController().signal)).toBeNull();
    expect(FakeWorker.instances).toHaveLength(1);
  });
  it("bounds stalled worker loading", async () => {
    vi.useFakeTimers(); vi.stubGlobal("Worker", FakeWorker);
    const pending = bakeTerrainInWorker(fixture(), 0, new AbortController().signal)!;
    const failed = expect(pending).rejects.toThrow("unavailable"); await vi.advanceTimersByTimeAsync(15_000); await failed;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
});

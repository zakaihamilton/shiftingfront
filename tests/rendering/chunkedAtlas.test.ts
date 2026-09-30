import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFixture, TILE_CLEAR, TILE_WATER } from "../../lib/sim/fixtures";
import {
  bakeTerrainAtlasData,
  initAtlasBake,
  bakeAtlasRowSlice,
  finalizeAtlasBake,
} from "../../lib/render/terrainAtlasBake";
import {
  bakeTerrainAtlasDataAsync,
  getTerrainAtlas,
  getTerrainAtlasAsync,
  invalidateTerrainAtlas,
  isTerrainAtlasBaked,
  preloadTerrainAtlas,
} from "../../lib/render/terrainAtlas";

describe("chunked terrain atlas baking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateTerrainAtlas();
  });
  it("produces byte-identical output between sliced and synchronous baking", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    const syncData = bakeTerrainAtlasData(state);

    const ctx = initAtlasBake(state);
    expect(ctx.currentRow).toBe(0);

    // Bake in small slices of 4 rows
    while (ctx.currentRow < ctx.rows) {
      bakeAtlasRowSlice(ctx, 4);
    }
    const slicedData = finalizeAtlasBake(ctx);

    expect(slicedData.key).toBe(syncData.key);
    expect(slicedData.width).toBe(syncData.width);
    expect(slicedData.height).toBe(syncData.height);
    expect(slicedData.data.length).toBe(syncData.data.length);
    expect(slicedData.data).toEqual(syncData.data);
  });

  it("completes async chunked baking cleanly", async () => {
    const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const asyncData = await bakeTerrainAtlasDataAsync(state, { rowsPerChunk: 4 });
    const syncData = bakeTerrainAtlasData(state);

    expect(asyncData.key).toBe(syncData.key);
    expect(asyncData.data).toEqual(syncData.data);
  });

  it("prepares the default atlas request without blocking the caller", async () => {
    const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    invalidateTerrainAtlas();

    const atlasPromise = getTerrainAtlasAsync(state);
    expect(isTerrainAtlasBaked(state)).toBe(false);
    const atlas = await atlasPromise;
    expect(atlas.data.length).toBeGreaterThan(0);
    expect(getTerrainAtlas(state)).toBe(atlas);
    invalidateTerrainAtlas();
  });

  it("deduplicates pending atlas requests and avoids a synchronous bake", async () => {
    const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    invalidateTerrainAtlas();

    const first = getTerrainAtlasAsync(state, { rowsPerChunk: 1 });
    expect(isTerrainAtlasBaked(state)).toBe(false);
    expect(getTerrainAtlas(state).canvas).toBeNull();

    const second = getTerrainAtlasAsync(state, { rowsPerChunk: 1 });
    const [firstAtlas, secondAtlas] = await Promise.all([first, second]);

    expect(firstAtlas.data).toEqual(secondAtlas.data);
    expect(isTerrainAtlasBaked(state)).toBe(true);
    expect(getTerrainAtlas(state)).toBe(firstAtlas);
    invalidateTerrainAtlas();
  });

  it("rebuilds live layout changes in slices and cancels superseded work", async () => {
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(0));
      return 1;
    });
    const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const previous = getTerrainAtlasAsync(state, { rowsPerChunk: 1 });
    state.tiles[0] = TILE_WATER;
    expect(getTerrainAtlas(state).data).toHaveLength(0);
    const current = getTerrainAtlasAsync(state, { rowsPerChunk: 1 });
    await expect(previous).rejects.toMatchObject({ name: "AbortError" });
    const atlas = await current;
    expect(isTerrainAtlasBaked(state)).toBe(true);
    expect(atlas.data).toEqual(bakeTerrainAtlasData(state).data);
    expect(getTerrainAtlas(state)).toBe(atlas);
    state.tiles[0] = TILE_CLEAR;
    expect(getTerrainAtlas(state)).toBe(atlas);
    const rebuilt = await getTerrainAtlasAsync(state, { rowsPerChunk: 1 });
    expect(getTerrainAtlas(state)).toBe(rebuilt);
    expect(rebuilt).not.toBe(atlas);
  });

  it("cancels sliced baking when the rendering session is disposed", async () => {
    const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const promise = getTerrainAtlasAsync(state, { rowsPerChunk: 1 });
    invalidateTerrainAtlas();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(isTerrainAtlasBaked(state)).toBe(false);
  });

  it("reserves the atlas while textures load so rendering cannot trigger a synchronous bake", async () => {
    const images: FakeImage[] = [];
    class FakeImage {
      complete = false;
      naturalWidth = 0;
      src = "";
      listeners = new Map<string, () => void>();
      constructor() { images.push(this); }
      addEventListener(type: string, callback: () => void) { this.listeners.set(type, callback); }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
    const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const promise = preloadTerrainAtlas(state, { rowsPerChunk: 1 });
    expect(preloadTerrainAtlas(state, { rowsPerChunk: 1 })).toBe(promise);
    expect(images).toHaveLength(2);
    expect(isTerrainAtlasBaked(state)).toBe(false);
    expect(getTerrainAtlas(state).data).toHaveLength(0);
    expect(isTerrainAtlasBaked(state)).toBe(false);

    // Failed optional grain textures must still produce a usable base atlas.
    for (const image of images) {
      image.complete = true;
      image.listeners.get("error")!();
    }
    expect(await promise).toBe(true);
    expect(isTerrainAtlasBaked(state)).toBe(true);
    expect(getTerrainAtlas(state).data.length).toBeGreaterThan(0);
    invalidateTerrainAtlas();
    expect(await preloadTerrainAtlas(state, { rowsPerChunk: 1 })).toBe(true);
    expect(images).toHaveLength(2);
    expect(isTerrainAtlasBaked(state)).toBe(true);
  });
});

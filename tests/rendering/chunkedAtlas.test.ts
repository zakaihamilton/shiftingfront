import { describe, expect, it } from "vitest";
import { makeFixture } from "../../lib/sim/fixtures";
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
} from "../../lib/render/terrainAtlas";

describe("chunked terrain atlas baking", () => {
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
});

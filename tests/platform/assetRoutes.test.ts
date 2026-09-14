import { describe, expect, it } from "vitest";
import { GET, OPTIONS } from "../../app/api/assets/route";
import { GET as getAsset, OPTIONS as assetOptions } from "../../app/api/assets/[id]/route";
import { GET as getPreview, OPTIONS as previewOptions } from "../../app/api/assets/[id]/preview/route";
import { ASSET_API_VERSION } from "../../lib/gen/assetApi";
import { listGeneratedAssets } from "../../lib/gen/assetCatalog";

const ORIGIN = "https://example.test";

function request(path: string, init?: RequestInit) {
  return new Request(`${ORIGIN}${path}`, init);
}

function assetContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/assets", () => {
  it("lists the Asset Bay catalog with CORS and cache headers", async () => {
    const response = GET(request("/api/assets"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toContain("max-age=3600");

    const body = await response.json() as {
      apiVersion: number;
      name: string;
      categories: string[];
      count: number;
      assets: Array<{ id: string; metadataUrl: string; previewUrl: string }>;
    };
    expect(body.apiVersion).toBe(ASSET_API_VERSION);
    expect(body.name).toBe("Shifting Front Asset Bay");
    expect(body.categories).toEqual(["unit", "building", "wreck", "rubble"]);
    expect(body.count).toBe(listGeneratedAssets().length);
    expect(body.assets).toHaveLength(body.count);
    expect(body.assets[0]?.metadataUrl).toContain("/api/assets/");
    expect(body.assets[0]?.previewUrl).toContain("/preview");
  });

  it("filters by category and rejects unknown categories", async () => {
    const units = GET(request("/api/assets?category=unit"));
    expect(units.status).toBe(200);
    const unitBody = await units.json() as { count: number; assets: Array<{ category: string }> };
    expect(unitBody.assets.every((asset) => asset.category === "unit")).toBe(true);
    expect(unitBody.count).toBe(unitBody.assets.length);
    expect(unitBody.count).toBeGreaterThan(0);

    const unknown = GET(request("/api/assets?category=spaceship"));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: "Unknown asset category: spaceship" });
  });

  it("answers OPTIONS with CORS preflight headers", () => {
    const response = OPTIONS(request("/api/assets", {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "X-Asset-Client",
      },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toContain("max-age=3600");
    expect(response.headers.get("Allow")).toBe("GET, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("X-Asset-Client");
  });
});

describe("GET /api/assets/:id", () => {
  it("returns one catalog item", async () => {
    const response = await getAsset(request("/api/assets/unit:infantry"), assetContext("unit:infantry"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = await response.json() as { apiVersion: number; asset: { id: string; render: { supportsFacing: boolean } } };
    expect(body.apiVersion).toBe(ASSET_API_VERSION);
    expect(body.asset.id).toBe("unit:infantry");
    expect(body.asset.render.supportsFacing).toBe(true);
  });

  it("decodes percent-encoded ids and 404s missing assets", async () => {
    const encoded = await getAsset(
      request("/api/assets/unit%3Aharvester"),
      assetContext("unit%3Aharvester"),
    );
    expect(encoded.status).toBe(200);
    expect((await encoded.json() as { asset: { id: string } }).asset.id).toBe("unit:harvester");

    const missing = await getAsset(request("/api/assets/unit:nope"), assetContext("unit:nope"));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Asset not found" });

    const malformed = await getAsset(request("/api/assets/%"), assetContext("%"));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Asset id is not valid URL encoding" });
  });
});

describe("GET /api/assets/:id/preview", () => {
  it("renders a unit preview as SVG and accepts facings 0-7", async () => {
    const response = await getPreview(
      request("/api/assets/unit:medic/preview?facing=3"),
      assetContext("unit:medic"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Content-Type")).toContain("image/svg+xml");
    const svg = await response.text();
    expect(svg).toContain("<svg");
  });

  it("rejects invalid facings and directional previews on buildings", async () => {
    const badFacing = await getPreview(
      request("/api/assets/unit:infantry/preview?facing=9"),
      assetContext("unit:infantry"),
    );
    expect(badFacing.status).toBe(400);
    expect(await badFacing.json()).toEqual({ error: "facing must be an integer from 0 to 7" });

    const buildingFacing = await getPreview(
      request("/api/assets/building:power/preview?facing=2"),
      assetContext("building:power"),
    );
    expect(buildingFacing.status).toBe(400);
    expect(await buildingFacing.json()).toEqual({ error: "This asset does not support directional previews" });

    const fractionalFacing = await getPreview(
      request("/api/assets/unit:infantry/preview?facing=1.5"),
      assetContext("unit:infantry"),
    );
    expect(fractionalFacing.status).toBe(400);
    expect(await fractionalFacing.json()).toEqual({ error: "facing must be an integer from 0 to 7" });
  });

  it("redirects raster building previews to the art plate", async () => {
    const response = await getPreview(
      request("/api/assets/building:power/preview"),
      assetContext("building:power"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toContain("max-age=3600");
    expect(response.headers.get("Location")).toMatch(/\/art\/sprites\/.+\.webp$/);
  });
});

describe("nested Asset Bay CORS preflight", () => {
  it("answers OPTIONS on metadata and preview routes", () => {
    const headers = {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "X-Asset-Client",
      },
    } satisfies RequestInit;
    for (const response of [
      assetOptions(request("/api/assets/unit:infantry", headers)),
      previewOptions(request("/api/assets/unit:infantry/preview", headers)),
    ]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Allow")).toBe("GET, OPTIONS");
      expect(response.headers.get("Access-Control-Allow-Headers")).toBe("X-Asset-Client");
    }
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import manifest from "../../app/manifest";
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, APP_THEME_COLOR } from "../../lib/site";
import { buildFaviconIco, rasterize, rasterizeMaskable } from "../../scripts/rasterize-icons";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BITMAPINFOHEADER_SIZE = 40;

const ICONS = [
  ["public/icons/pwa-192.png", 192, () => rasterize(192)],
  ["public/icons/pwa-512.png", 512, () => rasterize(512)],
  ["public/icons/pwa-maskable-512.png", 512, () => rasterizeMaskable(512)],
  ["app/apple-icon.png", 180, () => rasterize(180)],
  ["app/icon.png", 192, () => rasterize(192)],
] as const;

function icoDirectory(file: Buffer): { count: number; sizes: number[]; payloads: Buffer[] } {
  const count = file.readUInt16LE(4);
  const sizes: number[] = [];
  const payloads: Buffer[] = [];
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    const width = file.readUInt8(entry);
    const bytes = file.readUInt32LE(entry + 8);
    const offset = file.readUInt32LE(entry + 12);
    sizes.push(width === 0 ? 256 : width);
    payloads.push(file.subarray(offset, offset + bytes));
  }
  return { count, sizes, payloads };
}

async function rawRgba(png: Buffer): Promise<{ width: number; height: number; data: Buffer }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

describe("PWA icons and manifest", () => {
  it("names the app and uses the chrome void colors", () => {
    const webApp = manifest();
    expect(webApp.name).toBe(APP_NAME);
    expect(webApp.short_name).toBe(APP_SHORT_NAME);
    expect(webApp.description).toBe(APP_DESCRIPTION);
    expect(webApp.description).toBe("A seeded isometric RTS — one 4-digit code writes the war.");
    expect(webApp.id).toBe("/");
    expect(webApp.display).toBe("standalone");
    expect(webApp.theme_color).toBe(APP_THEME_COLOR);
    expect(webApp.background_color).toBe(APP_THEME_COLOR);
    expect(webApp.screenshots).toBeDefined();
    expect(webApp.screenshots?.length).toBeGreaterThan(0);
    expect(webApp.shortcuts).toBeDefined();
    expect(webApp.shortcuts?.length).toBeGreaterThan(0);
    expect(webApp.icons?.map((icon) => icon.src)).toEqual([
      "/icons/pwa-192.png",
      "/icons/pwa-512.png",
      "/icons/pwa-maskable-512.png",
    ]);
  });

  it.each(ICONS)("%s is %d px, fully opaque, and matches rasterize-icons", async (file, size, generate) => {
    const path = resolve(process.cwd(), file);
    const onDisk = readFileSync(path);
    const meta = await sharp(onDisk).metadata();
    expect(meta.width).toBe(size);
    expect(meta.height).toBe(size);
    const { data } = await sharp(onDisk).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! < 255) transparent += 1;
    }
    expect(transparent).toBe(0);
    expect(await rawRgba(onDisk)).toEqual(await rawRgba(await generate()));
  });

  it("ships a 16 and 32 px BMP favicon.ico, not PNG-in-ICO", async () => {
    const file = readFileSync(resolve(process.cwd(), "app/favicon.ico"));
    expect(file.readUInt16LE(2)).toBe(1);
    const directory = icoDirectory(file);
    expect({ count: directory.count, sizes: directory.sizes }).toEqual({ count: 2, sizes: [16, 32] });
    for (const payload of directory.payloads) {
      expect(payload.subarray(0, 8).equals(PNG_MAGIC)).toBe(false);
      expect(payload.readUInt32LE(0)).toBe(BITMAPINFOHEADER_SIZE);
    }
    expect(file.equals(await buildFaviconIco())).toBe(true);
  });
});

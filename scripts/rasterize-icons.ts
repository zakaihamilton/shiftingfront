import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { APP_THEME_RGB } from "../lib/site";

/**
 * Rasterize `app/icon-source.png` into favicon.ico, apple-touch, app icon, and
 * PWA PNGs. Uses the `sharp` already hoisted by Next; it is not a runtime app
 * dependency.
 *
 *   pnpm rasterize-icons
 */
const ROOT = process.cwd();
const SOURCE = join(ROOT, "app/icon-source.png");
const APP_ICON = join(ROOT, "app/icon.png");
const APPLE_ICON = join(ROOT, "app/apple-icon.png");
const FAVICON_ICO = join(ROOT, "app/favicon.ico");
const PWA_DIR = join(ROOT, "public/icons");
const VOID = { ...APP_THEME_RGB };
const MASKABLE_SAFE_ZONE = 0.8;

export async function rasterize(px: number): Promise<Buffer> {
  return sharp(SOURCE)
    .resize(px, px, { fit: "fill", kernel: "lanczos3" })
    .flatten({ background: VOID })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function rasterizeMaskable(px: number): Promise<Buffer> {
  const markSize = Math.round(px * MASKABLE_SAFE_ZONE);
  const mark = await rasterize(markSize);
  return sharp({
    create: {
      width: px,
      height: px,
      channels: 4,
      background: VOID,
    },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .flatten({ background: VOID })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function bmpIcoFrame(size: number, rgba: Buffer): Buffer {
  const headerSize = 40;
  const xorSize = size * size * 4;
  const andRowBytes = Math.ceil(size / 32) * 4;
  const andSize = andRowBytes * size;
  const dib = Buffer.alloc(headerSize + xorSize + andSize);
  dib.writeUInt32LE(headerSize, 0);
  dib.writeInt32LE(size, 4);
  dib.writeInt32LE(size * 2, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(xorSize + andSize, 20);
  for (let y = 0; y < size; y++) {
    const srcY = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const src = (srcY * size + x) * 4;
      const dest = headerSize + (y * size + x) * 4;
      dib[dest] = rgba[src + 2]!;
      dib[dest + 1] = rgba[src + 1]!;
      dib[dest + 2] = rgba[src]!;
      dib[dest + 3] = rgba[src + 3]!;
    }
  }
  return dib;
}

function icoFromBmps(frames: { size: number; dib: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * frames.length;
  for (const frame of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(frame.size === 256 ? 0 : frame.size, 0);
    entry.writeUInt8(frame.size === 256 ? 0 : frame.size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(frame.dib.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += frame.dib.length;
  }
  return Buffer.concat([header, ...entries, ...frames.map((frame) => frame.dib)]);
}

async function icoFrame(px: number): Promise<{ size: number; dib: Buffer }> {
  const { data } = await sharp(SOURCE)
    .resize(px, px, { fit: "fill", kernel: "lanczos3" })
    .flatten({ background: VOID })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { size: px, dib: bmpIcoFrame(px, data) };
}

export async function buildFaviconIco(): Promise<Buffer> {
  return icoFromBmps([await icoFrame(16), await icoFrame(32)]);
}

async function writePng(path: string, png: Buffer): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
  const meta = await sharp(png).metadata();
  console.log(`${relative(ROOT, path)}  ${meta.width}x${meta.height}`);
}

async function writeIcons(): Promise<void> {
  writeFileSync(FAVICON_ICO, await buildFaviconIco());
  console.log(`${relative(ROOT, FAVICON_ICO)}  16x16+32x32`);
  await writePng(APP_ICON, await rasterize(192));
  await writePng(APPLE_ICON, await rasterize(180));
  await writePng(join(PWA_DIR, "pwa-192.png"), await rasterize(192));
  await writePng(join(PWA_DIR, "pwa-512.png"), await rasterize(512));
  await writePng(join(PWA_DIR, "pwa-maskable-512.png"), await rasterizeMaskable(512));
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (invokedDirectly()) {
  writeIcons().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

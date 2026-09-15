import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { APP_DESCRIPTION, APP_NAME } from "../lib/site";

const ROOT = process.cwd();
const VISTA_SOURCE = join(ROOT, "public/art/menu-command-vista.webp");
const MISSION_SOURCE = join(ROOT, "docs/mission-desktop.png");

const OPENGRAPH_PNG = join(ROOT, "app/opengraph-image.png");
const TWITTER_PNG = join(ROOT, "app/twitter-image.png");
const ITCH_COVER_PUBLIC = join(ROOT, "public/promo/itch-cover.png");
const ITCH_COVER_PRESS = join(ROOT, "docs/press/itch-cover-630x500.png");
const PRESS_DIR = join(ROOT, "docs/press");

export async function generateOpenGraphImage(): Promise<Buffer> {
  // Target: 1200x630, 1.91:1 ratio
  const width = 1200;
  const height = 630;

  // Background vista cropped and resized
  const base = await sharp(VISTA_SOURCE)
    .resize(width, height, { fit: "cover", position: "center" })
    .toBuffer();

  // SVG overlay with game branding and tactical HUD styling
  const svgOverlay = Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="vignette" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#05080e" stop-opacity="0.8"/>
          <stop offset="40%" stop-color="#05080e" stop-opacity="0.2"/>
          <stop offset="70%" stop-color="#05080e" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="#05080e" stop-opacity="0.95"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#vignette)"/>
      <rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="none" stroke="#243040" stroke-width="2"/>
      <rect x="20" y="20" width="16" height="16" fill="#5ce1e6"/>
      <rect x="${width - 36}" y="20" width="16" height="16" fill="#5ce1e6"/>
      <rect x="20" y="${height - 36}" width="16" height="16" fill="#5ce1e6"/>
      <rect x="${width - 36}" y="${height - 36}" width="16" height="16" fill="#5ce1e6"/>

      <!-- Brand Mark and Title -->
      <g transform="translate(60, 80)">
        <rect width="48" height="48" rx="4" fill="#5ce1e6"/>
        <text x="24" y="34" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="28" fill="#05080e" text-anchor="middle">SF</text>
        <text x="66" y="35" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="34" fill="#ffffff" letter-spacing="4">${APP_NAME.toUpperCase()}</text>
      </g>

      <!-- Bottom Headline and Details -->
      <g transform="translate(60, 480)">
        <text x="0" y="30" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="44" fill="#ffffff" letter-spacing="2">SEEDED ISOMETRIC RTS</text>
        <text x="0" y="70" font-family="system-ui, -apple-system, sans-serif" font-weight="600" font-size="22" fill="#5ce1e6" letter-spacing="1">10,000 CAMPAIGNS · ONE 4-DIGIT CODE WRITES THE WAR</text>
        <text x="0" y="100" font-family="system-ui, -apple-system, sans-serif" font-weight="500" font-size="18" fill="#9db0be">${APP_DESCRIPTION}</text>
      </g>

      <!-- Badge -->
      <g transform="translate(${width - 320}, 72)">
        <rect width="260" height="42" rx="2" fill="#0d1520" stroke="#5ce1e6" stroke-width="1.5"/>
        <text x="130" y="27" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="16" fill="#5ce1e6" text-anchor="middle" letter-spacing="2">PLAY IN BROWSER · FREE</text>
      </g>
    </svg>
  `);

  return sharp(base)
    .composite([{ input: svgOverlay, gravity: "northwest" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function generateItchCover(): Promise<Buffer> {
  // Target: 630x500
  const width = 630;
  const height = 500;

  const base = await sharp(VISTA_SOURCE)
    .resize(width, height, { fit: "cover", position: "center" })
    .toBuffer();

  const svgOverlay = Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="coverVignette" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#05080e" stop-opacity="0.8"/>
          <stop offset="50%" stop-color="#05080e" stop-opacity="0.1"/>
          <stop offset="100%" stop-color="#05080e" stop-opacity="0.95"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#coverVignette)"/>
      <rect x="16" y="16" width="${width - 32}" height="${height - 32}" fill="none" stroke="#243040" stroke-width="1.5"/>

      <!-- Header Brand -->
      <g transform="translate(36, 48)">
        <rect width="36" height="36" rx="2" fill="#5ce1e6"/>
        <text x="18" y="26" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="20" fill="#05080e" text-anchor="middle">SF</text>
        <text x="48" y="26" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="24" fill="#ffffff" letter-spacing="3">${APP_NAME.toUpperCase()}</text>
      </g>

      <!-- Footer Info -->
      <g transform="translate(36, 390)">
        <text x="0" y="26" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="30" fill="#ffffff" letter-spacing="1">ISOMETRIC RTS</text>
        <text x="0" y="54" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="15" fill="#5ce1e6" letter-spacing="1">SEEDED PROCEDURAL CAMPAIGNS</text>
        <text x="0" y="78" font-family="system-ui, -apple-system, sans-serif" font-weight="500" font-size="13" fill="#9db0be">Free · Client-side · No Account Required</text>
      </g>
    </svg>
  `);

  return sharp(base)
    .composite([{ input: svgOverlay, gravity: "northwest" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function generateScreenshots(): Promise<void> {
  mkdirSync(PRESS_DIR, { recursive: true });
  mkdirSync(dirname(ITCH_COVER_PUBLIC), { recursive: true });

  // 1. Command Vista (1920x1080)
  await sharp(VISTA_SOURCE)
    .resize(1920, 1080, { fit: "cover" })
    .png({ compressionLevel: 8 })
    .toFile(join(PRESS_DIR, "screenshot-5-command-vista.png"));

  // 2. Banner (1920x1080)
  await sharp(VISTA_SOURCE)
    .resize(1920, 1080, { fit: "cover" })
    .png({ compressionLevel: 8 })
    .toFile(join(PRESS_DIR, "banner-1920x1080.png"));

  // 3. If mission screenshot exists, generate variations
  if (existsSync(MISSION_SOURCE)) {
    // Gameplay Base Building
    await sharp(MISSION_SOURCE)
      .resize(1920, 1080, { fit: "cover" })
      .png({ compressionLevel: 8 })
      .toFile(join(PRESS_DIR, "screenshot-1-base-building.png"));

    // Tactical Combat Crop
    await sharp(MISSION_SOURCE)
      .extract({ left: 100, top: 40, width: 1280, height: 720 })
      .resize(1920, 1080, { fit: "cover" })
      .png({ compressionLevel: 8 })
      .toFile(join(PRESS_DIR, "screenshot-2-tactical-combat.png"));

    // Mission Operations
    await sharp(MISSION_SOURCE)
      .extract({ left: 40, top: 20, width: 1400, height: 750 })
      .resize(1920, 1080, { fit: "cover" })
      .png({ compressionLevel: 8 })
      .toFile(join(PRESS_DIR, "screenshot-3-mission-briefing.png"));

    // Campaign Dossier
    await sharp(VISTA_SOURCE)
      .extract({ left: 50, top: 30, width: 1550, height: 880 })
      .resize(1920, 1080, { fit: "cover" })
      .png({ compressionLevel: 8 })
      .toFile(join(PRESS_DIR, "screenshot-4-campaign-dossier.png"));
  }
}

async function run(): Promise<void> {
  console.log("Generating universal OpenGraph images...");
  const ogPng = await generateOpenGraphImage();
  mkdirSync(dirname(OPENGRAPH_PNG), { recursive: true });
  await sharp(ogPng).toFile(OPENGRAPH_PNG);
  await sharp(ogPng).toFile(TWITTER_PNG);
  console.log(`Generated: ${relative(ROOT, OPENGRAPH_PNG)} (1200x630)`);
  console.log(`Generated: ${relative(ROOT, TWITTER_PNG)} (1200x630)`);

  console.log("Generating itch.io cover art...");
  const itchCover = await generateItchCover();
  mkdirSync(dirname(ITCH_COVER_PRESS), { recursive: true });
  mkdirSync(dirname(ITCH_COVER_PUBLIC), { recursive: true });
  await sharp(itchCover).toFile(ITCH_COVER_PRESS);
  await sharp(itchCover).toFile(ITCH_COVER_PUBLIC);
  console.log(`Generated: ${relative(ROOT, ITCH_COVER_PRESS)} (630x500)`);
  console.log(`Generated: ${relative(ROOT, ITCH_COVER_PUBLIC)} (630x500)`);

  console.log("Generating store screenshots and press kit assets...");
  await generateScreenshots();
  console.log(`Generated press assets in ${relative(ROOT, PRESS_DIR)}`);
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (invokedDirectly()) {
  run().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

import { readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";
import sharp from "sharp";

/**
 * One-shot PNG/WebP → alpha WebP converter. Uses the `sharp` already hoisted by
 * Next; it is not a runtime app dependency. Portrait sheets are capped at 1280
 * px wide; canvas loaders derive their frame sizes from the natural dimensions.
 * Directional sprites keep their dimensions because their crop metadata is
 * source-size coupled.
 *
 *   yarn compress-art --dry-run
 *   yarn compress-art portraits
 *   yarn compress-art sprites terrain
 *   yarn compress-art all
 */
const ART_ROOT = join(process.cwd(), "public/art");

const TARGETS: Record<string, string> = {
  portraits: join(ART_ROOT, "portraits"),
  sprites: join(ART_ROOT, "sprites/sleek-modular"),
  terrain: join(ART_ROOT, "terrain"),
  results: join(ART_ROOT, "results"),
  textures: join(ART_ROOT, "textures"),
  all: ART_ROOT,
};

/** Balanced lossy WebP with a lossless alpha plane; art is displayed at much smaller sizes. */
const WEBP = {
  quality: 88,
  alphaQuality: 100,
  effort: 6,
  smartSubsample: true,
} as const;
const PORTRAIT_MAX_WIDTH = 1280;

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function listImages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listImages(full));
    else if (entry.isFile() && /\.(png|webp)$/i.test(entry.name)) out.push(full);
  }
  return out.sort();
}

function isPortrait(input: string): boolean {
  return input.startsWith(`${join(ART_ROOT, "portraits")}/`);
}

function resolveTargets(names: string[]): string[] {
  if (names.includes("all")) return [ART_ROOT];

  const dirs: string[] = [];
  for (const name of names) {
    const mapped = TARGETS[name];
    if (mapped) {
      dirs.push(mapped);
      continue;
    }
    throw new Error(`Unknown target "${name}". Use portraits, sprites, terrain, results, textures, or all.`);
  }
  return [...new Set(dirs)];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const names = args.filter((arg) => arg !== "--dry-run");
  const dirs = resolveTargets(names.length > 0 ? names : ["portraits"]);
  const files = dirs.flatMap(listImages);

  if (files.length === 0) {
    console.log("No PNG or WebP files found.");
    return;
  }

  let before = 0;
  let after = 0;

  for (const input of files) {
    const isWebp = /\.webp$/i.test(input);
    const webp = isWebp ? input : input.replace(/\.png$/i, ".webp");
    const inputBytes = statSync(input).size;
    before += inputBytes;
    const srcMetadata = await sharp(input).metadata();
    const srcHadTransparency = Boolean(srcMetadata.hasAlpha);
    const source = sharp(input).ensureAlpha();
    if (isPortrait(input)) source.resize({ width: PORTRAIT_MAX_WIDTH, withoutEnlargement: true });
    const pipeline = source.webp(WEBP);
    if (dryRun) {
      const buf = await pipeline.toBuffer();
      after += buf.length;
      console.log(
        `${relative(process.cwd(), input)}  ${formatBytes(inputBytes)} → ${formatBytes(buf.length)}  (dry-run)`,
      );
      continue;
    }
    const tempWebp = `${webp}.tmp`;
    await pipeline.toFile(tempWebp);
    const candidateBytes = statSync(tempWebp).size;
    if (isWebp && candidateBytes >= inputBytes) {
      unlinkSync(tempWebp);
      after += inputBytes;
      console.log(
        `${relative(process.cwd(), input)}  ${formatBytes(inputBytes)} → kept (candidate ${formatBytes(candidateBytes)})`,
      );
      continue;
    }
    renameSync(tempWebp, webp);
    const meta = await sharp(webp).metadata();
    if (srcHadTransparency && !meta.hasAlpha) {
      console.warn(`warning: ${relative(process.cwd(), webp)} dropped a useful alpha plane`);
    }
    const outputBytes = statSync(webp).size;
    after += outputBytes;
    if (!isWebp) unlinkSync(input);
    console.log(`${relative(process.cwd(), input)}  ${formatBytes(inputBytes)} → ${formatBytes(outputBytes)}`);
  }

  console.log(
    `${dryRun ? "dry-run " : ""}${files.length} files  ${formatBytes(before)} → ${formatBytes(after)}  (${((after / before) * 100).toFixed(1)}%)`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(SCRIPT_DIR, "assets/behemoth");
const OUTPUT_DIR = path.resolve(SCRIPT_DIR, "../public/art/sprites/sleek-modular");
const CANVAS_SIZE = 512;
const GROUND_Y = 475;

// Every perspective has its own checked-in, authored source image. Do not flip
// one side to synthesize the other: asymmetrical hull details and lighting are
// meaningful in these directional views.
const VIEWS = [
  { name: "front", targetWidth: 430 },
  { name: "back", targetWidth: 430 },
  { name: "left", targetWidth: 450 },
  { name: "right", targetWidth: 450 },
  { name: "front-left", targetWidth: 440 },
  { name: "front-right", targetWidth: 440 },
  { name: "back-left", targetWidth: 440 },
  { name: "back-right", targetWidth: 440 },
];

/** Remove near-white background pixels connected to the image border. */
async function extractCutout(imagePath) {
  const { data, info } = await sharp(imagePath)
    .flatten({ background: "#fff" })
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 3) throw new Error(`Expected RGB source image, got ${channels} channels: ${imagePath}`);

  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let tail = 0;

  function isBackground(x, y) {
    const offset = (y * width + x) * 3;
    return data[offset] >= 242 && data[offset + 1] >= 242 && data[offset + 2] >= 242;
  }

  function addBorderPixel(x, y) {
    const index = y * width + x;
    if (!visited[index] && isBackground(x, y)) {
      visited[index] = 1;
      queue[tail++] = index;
    }
  }

  for (let x = 0; x < width; x++) {
    addBorderPixel(x, 0);
    addBorderPixel(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    addBorderPixel(0, y);
    addBorderPixel(width - 1, y);
  }

  for (let head = 0; head < tail; head++) {
    const index = queue[head];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) addBackgroundNeighbor(index - 1, x - 1, y);
    if (x + 1 < width) addBackgroundNeighbor(index + 1, x + 1, y);
    if (y > 0) addBackgroundNeighbor(index - width, x, y - 1);
    if (y + 1 < height) addBackgroundNeighbor(index + width, x, y + 1);
  }

  function addBackgroundNeighbor(index, x, y) {
    if (!visited[index] && isBackground(x, y)) {
      visited[index] = 1;
      queue[tail++] = index;
    }
  }

  const rgba = Buffer.alloc(pixelCount * 4);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const sourceOffset = pixel * 3;
      const targetOffset = pixel * 4;
      const r = data[sourceOffset];
      const g = data[sourceOffset + 1];
      const b = data[sourceOffset + 2];
      rgba[targetOffset] = r;
      rgba[targetOffset + 1] = g;
      rgba[targetOffset + 2] = b;

      if (visited[pixel]) {
        rgba[targetOffset + 3] = 0;
        continue;
      }

      const touchesBackground =
        (x > 0 && visited[pixel - 1]) ||
        (x + 1 < width && visited[pixel + 1]) ||
        (y > 0 && visited[pixel - width]) ||
        (y + 1 < height && visited[pixel + width]);
      const brightness = (r + g + b) / 3;
      const alpha = touchesBackground
        ? Math.max(0, Math.min(1, (255 - brightness) / 65))
        : 1;
      rgba[targetOffset + 3] = Math.round(alpha * 255);
      if (alpha > 0 && alpha < 1) {
        // The checked-in source images have a white matte. Remove its color
        // contribution from anti-aliased edge pixels before storing alpha, or
        // the cutout will show a pale outline on the battlefield.
        rgba[targetOffset] = Math.max(0, Math.min(255, Math.round((r - 255 * (1 - alpha)) / alpha)));
        rgba[targetOffset + 1] = Math.max(0, Math.min(255, Math.round((g - 255 * (1 - alpha)) / alpha)));
        rgba[targetOffset + 2] = Math.max(0, Math.min(255, Math.round((b - 255 * (1 - alpha)) / alpha)));
      }

      if (rgba[targetOffset + 3] >= 12) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) throw new Error(`No foreground found in ${imagePath}`);
  return {
    raw: rgba,
    width,
    height,
    bounds: { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

async function renderView(view) {
  const sourcePath = path.join(SOURCE_DIR, `behemoth-${view.name}-source-v1.webp`);
  await fs.access(sourcePath);
  const cutout = await extractCutout(sourcePath);
  const { left, top, width, height } = cutout.bounds;
  const targetHeight = Math.round(height * (view.targetWidth / width));
  if (view.targetWidth > CANVAS_SIZE || targetHeight > GROUND_Y) {
    throw new Error(`${view.name} does not fit its ${CANVAS_SIZE}x${CANVAS_SIZE} frame`);
  }

  const resized = await sharp(cutout.raw, {
    raw: { width: cutout.width, height: cutout.height, channels: 4 },
  })
    .extract({ left, top, width, height })
    .resize(view.targetWidth, targetHeight, { fit: "fill" })
    .png()
    .toBuffer();

  const outputPath = path.join(OUTPUT_DIR, `behemoth-${view.name}-v1.webp`);
  await sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left: Math.round((CANVAS_SIZE - view.targetWidth) / 2), top: GROUND_Y - targetHeight }])
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(outputPath);

  const { size } = await fs.stat(outputPath);
  process.stdout.write(`Saved ${path.basename(outputPath)} (${size} bytes)\n`);
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
for (const view of VIEWS) await renderView(view);
process.stdout.write(`Generated ${VIEWS.length} authored views with a shared y=${GROUND_Y} ground line.\n`);

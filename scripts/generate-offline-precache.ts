import { readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Include lazy chunks and worker bundles that never appear in prerendered HTML.
async function collectRuntimeAssets(directory: string, prefix = ""): Promise<string[]> {
  const assets: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) assets.push(...await collectRuntimeAssets(join(directory, entry.name), `${relative}/`));
    else if (/\.(?:js|css|woff2?)$/.test(entry.name)) assets.push(`/_next/static/${relative}`);
  }
  return assets;
}

export async function generateOfflinePrecache(directory: string): Promise<string[]> {
  const assets = (await collectRuntimeAssets(directory)).sort();
  if (assets.length === 0) throw new Error("No built runtime assets found for offline precache.");
  await writeFile(join(directory, "offline-precache.json"), JSON.stringify(assets));
  return assets;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void generateOfflinePrecache(join(process.cwd(), ".next", "static"))
    .then((assets) => console.log(`Offline precache manifest: ${assets.length} runtime assets.`))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}

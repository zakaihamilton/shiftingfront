import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { generateOfflinePrecache } from "@/scripts/generate-offline-precache";

it("generates a manifest including lazy chunks and worker files without source maps", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shiftingfront-precache-"));
  try {
    const paths = ["chunks/game-lazy.js", "chunks/worker.js", "css/game.css", "media/font.woff2", "chunks/game-lazy.js.map"];
    for (const path of paths) {
      await mkdir(join(directory, path, ".."), { recursive: true });
      await writeFile(join(directory, path), "asset");
    }
    await writeFile(join(directory, "offline-precache.json"), "old manifest");
    const urls = await generateOfflinePrecache(directory);
    expect(urls).toEqual(paths.filter((path) => !path.endsWith(".map")).map((path) => `/_next/static/${path}`).sort());
    expect(JSON.parse(await readFile(join(directory, "offline-precache.json"), "utf8"))).toEqual(urls);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

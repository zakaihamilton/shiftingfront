import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const IDENTITY_PATHS = [
  "lib/sim",
  "lib/gen",
  "lib/catalog",
  "lib/seed",
  "lib/catalog.ts",
  "lib/types.ts",
  "lib/gameplayRules.ts",
  "lib/multiplayer/protocol.ts",
  "lib/multiplayer/checksum.ts",
  "lib/persist/save/validation.ts",
  "lib/persist/utils.ts",
  "yarn.lock",
] as const;

export function simulationBuildIdentity(root: string): string {
  const files: string[] = [];
  const visit = (relative: string) => {
    const absolute = join(root, relative);
    if (!existsSync(absolute)) return;
    if (statSync(absolute).isDirectory()) {
      for (const child of readdirSync(absolute).sort()) visit(`${relative}/${child}`);
    } else if (/\.(ts|tsx)$/.test(relative) || relative === "yarn.lock") files.push(relative);
  };
  for (const path of IDENTITY_PATHS) visit(path);
  const hash = createHash("sha256");
  for (const path of files.sort()) hash.update(path).update("\0").update(readFileSync(join(root, path))).update("\0");
  return hash.digest("hex");
}

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Compare raw bytes at existing public URLs, including uncommitted changes. */
export function changedAssetPaths(base: string, cwd = process.cwd()): string[] {
  const git = (args: string[]) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let commit: string;
  try {
    commit = git(["rev-parse", "--verify", "--end-of-options", `${base}^{commit}`]).toString().trim();
  } catch {
    throw new Error(`Cannot resolve asset comparison base ${JSON.stringify(base)} to a commit. Fetch it before running this check.`);
  }
  const root = git(["rev-parse", "--show-toplevel"]).toString().trim();
  const entries = git(["ls-tree", "-r", "-z", commit, "--", "public/art", "public/icons"]).toString().split("\0").filter(Boolean);
  const changed: string[] = [];
  for (const entry of entries) {
    const separator = entry.indexOf("\t");
    const [, type, objectId] = entry.slice(0, separator).split(" ");
    if (type !== "blob") continue;
    const path = entry.slice(separator + 1);
    const current = resolve(root, path);
    // Removing a URL is allowed; replacements must be published at a new URL.
    if (!existsSync(current)) continue;
    const previous = git(["cat-file", "blob", objectId]);
    if (!previous.equals(readFileSync(current))) changed.push(path);
  }
  return changed.sort();
}

export function checkAssetVersioning(args: string[]): number {
  if (args.length !== 2 || args[0] !== "--base" || !args[1]) {
    console.error("Usage: yarn health:asset-versioning --base <git-ref>");
    return 1;
  }
  try {
    const changed = changedAssetPaths(args[1]);
    if (changed.length) {
      console.error("Immutable assets changed bytes at existing URLs. Rename each replacement and update references and service-worker precache entries:");
      for (const path of changed) console.error(`  ${path}`);
      return 1;
    }
    console.log("Asset URL versioning passed: no existing immutable asset URL changed bytes.");
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = checkAssetVersioning(process.argv.slice(2));
}

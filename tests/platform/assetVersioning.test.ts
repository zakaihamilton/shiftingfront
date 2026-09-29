import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { changedAssetPaths, checkAssetVersioning } from "../../scripts/asset-versioning";

const fixtures: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "shiftingfront-assets-"));
  fixtures.push(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init");
  mkdirSync(join(root, "public/art"), { recursive: true });
  mkdirSync(join(root, "public/icons"), { recursive: true });
  writeFileSync(join(root, "public/art/unit-v1.webp"), Buffer.from([0, 1, 2, 255]));
  writeFileSync(join(root, "public/icons/icon-v1.png"), "icon");
  git("add", ".");
  git("-c", "user.name=Asset Test", "-c", "user.email=assets@example.test", "-c", "commit.gpgsign=false", "commit", "-m", "baseline");
  const base = git("rev-parse", "HEAD").toString().trim();
  return { root, git, base };
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("immutable asset URL versioning", () => {
  it("passes unchanged assets without writing to the repository", () => {
    const { root, git, base } = fixture();
    const before = git("status", "--porcelain").toString();
    expect(changedAssetPaths(base, root)).toEqual([]);
    expect(git("status", "--porcelain").toString()).toBe(before);
  });

  it.each(["public/art/large-v1.webp", "public/icons/large-v1.png"])("checks unchanged and modified assets over 1 MiB at %s", (assetPath) => {
    const { root, git } = fixture();
    const content = Buffer.alloc(2 * 1024 * 1024, 7);
    writeFileSync(join(root, assetPath), content);
    git("add", ".");
    git("-c", "user.name=Asset Test", "-c", "user.email=assets@example.test", "-c", "commit.gpgsign=false", "commit", "-m", "large asset");
    const base = git("rev-parse", "HEAD").toString().trim();
    const objects = git("count-objects").toString();
    expect(changedAssetPaths(base, root)).toEqual([]);
    content[content.length - 1] = 8;
    writeFileSync(join(root, assetPath), content);
    expect(changedAssetPaths(base, root)).toEqual([assetPath]);
    expect(git("count-objects").toString()).toBe(objects);
  });

  it("rejects uncommitted byte changes under both immutable roots", () => {
    const { root, base } = fixture();
    writeFileSync(join(root, "public/art/unit-v1.webp"), Buffer.from([0, 1, 3, 255]));
    writeFileSync(join(root, "public/icons/icon-v1.png"), "recompressed-icon");
    expect(changedAssetPaths(base, root)).toEqual(["public/art/unit-v1.webp", "public/icons/icon-v1.png"]);
  });

  it("rejects changes even after they are committed", () => {
    const { root, base, git } = fixture();
    writeFileSync(join(root, "public/art/unit-v1.webp"), "replacement");
    git("add", ".");
    git("-c", "user.name=Asset Test", "-c", "user.email=assets@example.test", "-c", "commit.gpgsign=false", "commit", "-m", "same-url edit");
    expect(changedAssetPaths(base, root)).toEqual(["public/art/unit-v1.webp"]);
  });

  it("allows new URLs, deleted URLs, and renamed replacements", () => {
    const { root, base } = fixture();
    renameSync(join(root, "public/art/unit-v1.webp"), join(root, "public/art/unit-v2.webp"));
    writeFileSync(join(root, "public/art/unit-v2.webp"), "replacement");
    writeFileSync(join(root, "public/art/new-v1.webp"), "new");
    rmSync(join(root, "public/icons/icon-v1.png"));
    expect(changedAssetPaths(base, root)).toEqual([]);
  });

  it("compares text asset bytes without Git newline normalization", () => {
    const { root, base, git } = fixture();
    writeFileSync(join(root, ".gitattributes"), "public/art/*.obj text eol=lf\n");
    writeFileSync(join(root, "public/art/model-v1.obj"), "v 0 0 0\n");
    git("add", ".");
    git("-c", "user.name=Asset Test", "-c", "user.email=assets@example.test", "-c", "commit.gpgsign=false", "commit", "-m", "model");
    const modelBase = git("rev-parse", "HEAD").toString().trim();
    writeFileSync(join(root, "public/art/model-v1.obj"), "v 0 0 0\r\n");
    expect(changedAssetPaths(modelBase, root)).toEqual(["public/art/model-v1.obj"]);
    expect(changedAssetPaths(base, root)).toEqual([]);
  });

  it("fails clearly for missing refs and never interprets refs as options", () => {
    const { root } = fixture();
    expect(() => changedAssetPaths("missing-ref", root)).toThrow("Cannot resolve asset comparison base");
    expect(() => changedAssetPaths("--help", root)).toThrow("Cannot resolve asset comparison base");
  });

  it("requires an explicit base reference", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(checkAssetVersioning([])).toBe(1);
    expect(checkAssetVersioning(["--base"])).toBe(1);
    expect(error).toHaveBeenCalledWith("Usage: yarn health:asset-versioning --base <git-ref>");
  });

  it("reports a failing exit code and names changed asset paths", () => {
    const { root, base } = fixture();
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    writeFileSync(join(root, "public/art/unit-v1.webp"), "changed");
    expect(checkAssetVersioning(["--base", base])).toBe(1);
    expect(error).toHaveBeenCalledWith("  public/art/unit-v1.webp");
  });

  it("reports a successful exit code for unchanged assets", () => {
    const { root, base } = fixture();
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(checkAssetVersioning(["--base", base])).toBe(0);
  });

  it("wires CI to a fetched PR or push comparison commit", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("github.event.pull_request.base.sha || github.event.before");
    expect(workflow).toContain('git fetch --no-tags --depth=1 origin "$ASSET_BASE_SHA"');
    expect(workflow).toContain('yarn health:asset-versioning --base "$ASSET_BASE_SHA"');
    expect(workflow).toContain('"0000000000000000000000000000000000000000"');
  });
});

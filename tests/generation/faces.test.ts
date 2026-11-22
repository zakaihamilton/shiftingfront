import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateCharacters } from "../../lib/gen/characters";
import { generateFace } from "../../lib/gen/faces";
import {
  DEFAULT_PORTRAIT_MOUTH_CALIBRATION,
  PORTRAIT_MOUTH_CALIBRATIONS,
  portraitMouthCalibration,
} from "../../lib/gen/portraitCalibration";
import { GENERATED_PORTRAIT_MOUTH_CALIBRATIONS } from "../../lib/gen/portraitCalibration.generated";
import {
  getPortraitAsset,
  PORTRAIT_ASSETS,
  portraitCandidates,
  portraitSheetNumber,
} from "../../lib/gen/portraitCatalog";
import {
  choosePortraitMouthClip,
  detectPortraitMouthClip,
  measurePortraitOffset,
  PORTRAIT_EYE_CLIPS,
  PORTRAIT_MOUTH_CLIP,
  PORTRAIT_OFFSET_NONE,
  portraitBlinking,
  portraitClipWindow,
  portraitFrameIndex,
  portraitFrameRect,
  portraitHasDrift,
  portraitRegistrationWindow,
  portraitSpeechFrame,
  resolvePortraitAnimation,
  resolvePortraitBlinkAlignment,
  scalePortraitOffset,
} from "../../lib/render/portraits";
import { createRng } from "../../lib/seed/rng";

describe("portrait DNA", () => {
  it("is deterministic for a forked seed", () => {
    const a = generateFace(createRng(421, "cmd-face"));
    const b = generateFace(createRng(421, "cmd-face"));
    expect(a).toEqual(b);
  });

  it("keeps DNA in valid ranges", () => {
    for (const seed of [0, 7, 42, 421, 9999]) {
      const face = generateFace(createRng(seed, "face"));
      expect(face.portraitId).toMatch(/^(commander|advisor|enemy-leader)-\d{2}$/);
      expect(typeof face.feminine).toBe("boolean");
    }
  });

  it("gives campaign officers distinct portraits", () => {
    const a = generateCharacters(421);
    const b = generateCharacters(421);
    expect(a).toEqual(b);
    expect(a.commander.face.portraitId).not.toEqual(a.advisor.face.portraitId);
    expect(a.commander.face.portraitId).not.toEqual(a.enemyLeader.face.portraitId);
    expect(a.advisor.face.portraitId).not.toEqual(a.enemyLeader.face.portraitId);
  });

  it("never reuses a portrait sheet in the same briefing", () => {
    for (const seed of [0, 42, 421, 2346, 9999]) {
      const c = generateCharacters(seed);
      const sheets = [
        portraitSheetNumber(c.commander.face.portraitId),
        portraitSheetNumber(c.advisor.face.portraitId),
        portraitSheetNumber(c.enemyLeader.face.portraitId),
      ];
      expect(new Set(sheets).size, `seed ${seed} sheets ${sheets.join(",")}`).toBe(3);
      expect(
        new Set([
          c.commander.face.portraitId,
          c.advisor.face.portraitId,
          c.enemyLeader.face.portraitId,
        ]).size,
      ).toBe(3);
    }
  });

  it("marks commander and enemy sheets 07, 09, and 11 as masculine", () => {
    for (const id of [
      "commander-07",
      "commander-09",
      "commander-11",
      "enemy-leader-07",
      "enemy-leader-09",
      "enemy-leader-11",
    ]) {
      expect(getPortraitAsset(id)?.feminine).toBe(false);
    }
    expect(getPortraitAsset("commander-01")?.feminine).toBe(true);
    expect(getPortraitAsset("advisor-07")?.feminine).toBe(true);
  });

  it("varies portrait sheets across a campaign", () => {
    const faces = [0, 42, 421, 2346, 9999].flatMap((seed) => {
      const c = generateCharacters(seed);
      return [c.commander.face, c.advisor.face, c.enemyLeader.face];
    });
    expect(new Set(faces.map((f) => f.portraitId)).size).toBeGreaterThan(4);
    expect(faces.some((f) => f.feminine) && faces.some((f) => !f.feminine)).toBe(true);
  });

  it("has a bitmap on disk for every catalog portrait", () => {
    const root = path.dirname(fileURLToPath(import.meta.url));
    expect(PORTRAIT_ASSETS.length).toBeGreaterThan(0);
    for (const asset of PORTRAIT_ASSETS) {
      const file = path.join(root, "..", "..", "public", asset.src.replace(/^\//, ""));
      expect(existsSync(file), asset.src).toBe(true);
    }
  });

  it("ships a distinct bitmap for every portrait asset", () => {
    const root = path.dirname(fileURLToPath(import.meta.url));
    const hashes = PORTRAIT_ASSETS.map((asset) => {
      const file = path.join(root, "..", "..", "public", asset.src.replace(/^\//, ""));
      return createHash("sha256").update(readFileSync(file)).digest("hex");
    });
    expect(new Set(hashes).size).toBe(PORTRAIT_ASSETS.length);
  });

  it("has destination-space mouth calibration for every shipped portrait", () => {
    expect(Object.keys(PORTRAIT_MOUTH_CALIBRATIONS)).toHaveLength(PORTRAIT_ASSETS.length);
    for (const asset of PORTRAIT_ASSETS) {
      const calibration = PORTRAIT_MOUTH_CALIBRATIONS[asset.id];
      expect(calibration, asset.id).toBeDefined();
      expect(asset.mouthCalibration).toBe(calibration);
      if (!calibration) continue;
      expect(calibration.clip.cx - calibration.clip.rx).toBeGreaterThanOrEqual(0);
      expect(calibration.clip.cx + calibration.clip.rx).toBeLessThanOrEqual(1);
      expect(calibration.clip.cy - calibration.clip.ry).toBeGreaterThanOrEqual(0);
      expect(calibration.clip.cy + calibration.clip.ry).toBeLessThanOrEqual(1);
      expect(Number.isFinite(calibration.talkOffset.dx)).toBe(true);
      expect(Number.isFinite(calibration.talkOffset.dy)).toBe(true);
    }
  });

  it("keeps generated mouth placements and manual talk offsets stable", () => {
    const lower = getPortraitAsset("commander-01")?.mouthCalibration;
    const upper = getPortraitAsset("commander-02")?.mouthCalibration;
    const generatedUpper = getPortraitAsset("advisor-03")?.mouthCalibration;
    const generatedLower = getPortraitAsset("advisor-01")?.mouthCalibration;
    expect(lower?.clip.cy).toBeGreaterThan(upper?.clip.cy ?? 1);
    expect(lower?.talkOffset).toEqual({ dx: 9, dy: 0 });
    expect(generatedLower?.clip.cy).toBeGreaterThan(0.7);
    expect(generatedUpper?.clip.cy).toBeGreaterThan(0.7);
    expect(getPortraitAsset("enemy-leader-01")?.mouthCalibration.talkOffset).toEqual({
      dx: 6,
      dy: 0,
    });
    expect(getPortraitAsset("enemy-leader-04")?.mouthCalibration.clip.cy).toBeCloseTo(0.7);
    expect(getPortraitAsset("enemy-leader-04")?.mouthCalibration.talkOffset).toEqual({
      dx: 1,
      dy: -3,
    });
    expect(getPortraitAsset("commander-12")?.mouthCalibration.clip.cy).toBeCloseTo(0.65);
    expect(getPortraitAsset("enemy-leader-07")?.mouthCalibration.clip.cy).toBeCloseTo(0.79);
    expect(generatedLower).not.toBe(generatedUpper);
    expect(portraitMouthCalibration("missing-portrait")).toEqual(
      DEFAULT_PORTRAIT_MOUTH_CALIBRATION,
    );
  });

  it("keeps generated calibration values distinct and in bounds", () => {
    const generated = Object.values(GENERATED_PORTRAIT_MOUTH_CALIBRATIONS);
    expect(generated).toHaveLength(PORTRAIT_ASSETS.length);
    expect(new Set(generated.map((entry) => entry.clip.cy)).size).toBeGreaterThan(1);
    expect(new Set(generated.map((entry) => entry)).size).toBe(generated.length);
    for (const entry of generated) {
      expect(entry.clip.cx).toBeGreaterThanOrEqual(0.35);
      expect(entry.clip.cx).toBeLessThanOrEqual(0.65);
      expect(entry.clip.cy).toBeGreaterThanOrEqual(0.54);
      expect(entry.clip.cy).toBeLessThanOrEqual(0.9);
      expect(entry.clip.cx - entry.clip.rx).toBeGreaterThanOrEqual(0);
      expect(entry.clip.cx + entry.clip.rx).toBeLessThanOrEqual(1);
      expect(entry.clip.cy - entry.clip.ry).toBeGreaterThanOrEqual(0);
      expect(entry.clip.cy + entry.clip.ry).toBeLessThanOrEqual(1);
      expect(Math.abs(entry.talkOffset.dx)).toBeLessThanOrEqual(10);
      expect(Math.abs(entry.talkOffset.dy)).toBeLessThanOrEqual(10);
    }
  });

  it("always has portrait candidates for a role and presentation", () => {
    for (const role of ["commander", "advisor", "enemyLeader"] as const) {
      expect(portraitCandidates({ role }).length).toBeGreaterThan(0);
      expect(portraitCandidates({ role, feminine: true }).length).toBeGreaterThan(0);
      expect(portraitCandidates({ role, feminine: false }).length).toBeGreaterThan(0);
      expect(
        portraitCandidates({ role, excludeSheets: [7] }).every((asset) => asset.sheet !== 7),
      ).toBe(true);
    }
  });

  it("holds speech visemes long enough to read at briefing size", () => {
    const sequence = Array.from({ length: 800 }, (_, time) =>
      portraitSpeechFrame(time, "commander-01", 3),
    );
    let longestOpen = 0;
    let longestClosed = 0;
    let openRun = 0;
    let closedRun = 0;
    let transitions = 0;
    for (const [index, frame] of sequence.entries()) {
      if (index > 0 && frame !== sequence[index - 1]) transitions += 1;
      if (frame === 2) {
        openRun += 1;
        closedRun = 0;
        longestOpen = Math.max(longestOpen, openRun);
      } else {
        closedRun += 1;
        openRun = 0;
        longestClosed = Math.max(longestClosed, closedRun);
      }
    }
    expect(longestOpen).toBeGreaterThanOrEqual(15);
    expect(longestClosed).toBeLessThanOrEqual(22);
    expect(transitions).toBeGreaterThanOrEqual(20);
  });

  it("alternates bitmap mouth frames while a portrait is speaking", () => {
    const sequence = Array.from({ length: 240 }, (_, time) =>
      portraitSpeechFrame(time, "commander-01", 3),
    );
    expect(new Set(sequence)).toEqual(new Set([0, 2]));
    expect(sequence.some((frame, index) => index > 0 && frame === sequence[index - 1])).toBe(true);
    expect(sequence.some((frame, index) => index > 0 && frame !== sequence[index - 1])).toBe(true);
    expect(portraitSpeechFrame(40, "commander-01", 3)).not.toBe(1);
  });

  it("keeps idle portraits blinking without opening the mouth", () => {
    const frames = Array.from({ length: 400 }, (_, time) =>
      portraitFrameIndex(time, false, 3, "commander-01"),
    );
    expect(frames).toContain(0);
    expect(frames).toContain(1);
    expect(frames).not.toContain(2);
    expect(
      frames.every((frame, time) => frame === (portraitBlinking(time, "commander-01") ? 1 : 0)),
    ).toBe(true);
  });

  it("clips blink and speech onto the idle frame instead of swapping the whole sheet", () => {
    expect(PORTRAIT_MOUTH_CLIP.cx).toBeCloseTo(0.5);
    expect(PORTRAIT_MOUTH_CLIP.cy).toBeCloseTo(0.635);
    expect(PORTRAIT_MOUTH_CLIP.cy).toBeLessThan(0.75);
    expect(PORTRAIT_MOUTH_CLIP.rx).toBeCloseTo(0.18);
    expect(PORTRAIT_MOUTH_CLIP.ry).toBeCloseTo(0.09);
    expect(PORTRAIT_MOUTH_CLIP.cy - PORTRAIT_MOUTH_CLIP.ry).toBeGreaterThanOrEqual(0.52);
    expect(PORTRAIT_EYE_CLIPS).toHaveLength(2);
    for (const clip of [PORTRAIT_MOUTH_CLIP, ...PORTRAIT_EYE_CLIPS]) {
      expect(clip.cx - clip.rx).toBeGreaterThanOrEqual(0);
      expect(clip.cx + clip.rx).toBeLessThanOrEqual(1);
      expect(clip.cy - clip.ry).toBeGreaterThanOrEqual(0);
      expect(clip.cy + clip.ry).toBeLessThanOrEqual(1);
    }
  });

  it("gives portraits independent deterministic blink timing", () => {
    const portraitIds = ["commander-01", "advisor-09", "enemy-leader-07"];
    const samples = portraitIds.flatMap((portraitId) =>
      Array.from({ length: 600 }, (_, time) => portraitBlinking(time, portraitId)),
    );
    expect(new Set(samples)).toEqual(new Set([false, true]));
    expect(portraitBlinking(0, "commander-01")).toBe(portraitBlinking(0, "commander-01"));
    const commanderTimeline = Array.from({ length: 600 }, (_, time) =>
      portraitBlinking(time, portraitIds[0]!),
    );
    expect(
      portraitIds
        .slice(1)
        .some((portraitId) =>
          commanderTimeline.some((value, time) => portraitBlinking(time, portraitId) !== value),
        ),
    ).toBe(true);
  });

  it("registers a drifted animation frame back onto the idle sheet", () => {
    const width = 48;
    const height = 48;
    const idle = rgbaSquare(width, height, 12, 10, 18, 16);
    const drifted = rgbaSquare(width, height, 12 + 4, 10 - 3, 18, 16);
    expect(measurePortraitOffset(idle, drifted, width, height, 8)).toEqual({ dx: -4, dy: 3 });
    expect(scalePortraitOffset({ dx: -4, dy: 3 }, 80, 200)).toEqual({ dx: -10, dy: 7.5 });
  });

  it("keeps blink registration independent from static mouth calibration", () => {
    const width = 48;
    const height = 48;
    const idle = rgbaSquare(width, height, 12, 10, 18, 16);
    const blink = rgbaSquare(width, height, 12 + 4, 10 - 3, 18, 16);
    expect(resolvePortraitBlinkAlignment(idle, blink, width, height)).toEqual({ dx: -4, dy: 3 });
  });

  it("registers a talk viseme using the mouth window, not the whole sheet", () => {
    const width = 64;
    const height = 64;
    const idle = rgbaSquare(width, height, 24, 36, 16, 10);
    const drifted = rgbaSquare(width, height, 24 + 3, 36, 16, 10);
    const window = portraitClipWindow(
      [{ cx: 0.5, cy: 0.635, rx: 0.18, ry: 0.09 }],
      width,
      height,
      4,
    );
    expect(window.y0).toBeGreaterThan(20);
    expect(measurePortraitOffset(idle, drifted, width, height, 8, window)).toEqual({
      dx: -3,
      dy: 0,
    });
  });

  it("detects the idle lip line for the mouth clip", () => {
    const width = 80;
    const height = 80;
    const idle = rgbaSquare(width, height, 0, 0, width, height, 170);
    paintRect(idle, width, 28, 50, 24, 3, 18);
    const clip = detectPortraitMouthClip(idle, width, height);
    expect(clip.cy).toBeGreaterThan(0.58);
    expect(clip.cy).toBeLessThan(0.7);
    expect(clip.cx).toBeGreaterThan(0.4);
    expect(clip.cx).toBeLessThan(0.6);
  });

  it("finds the viseme opening instead of a decoy lip line", () => {
    const width = 80;
    const height = 80;
    const idle = rgbaSquare(width, height, 0, 0, width, height, 170);
    paintRect(idle, width, 28, 42, 24, 3, 18);
    const talk = new Uint8ClampedArray(idle);
    paintRect(talk, width, 30, 51, 20, 8, 230);
    const clip = detectPortraitMouthClip(idle, width, height, talk);
    expect(clip.cy).toBeGreaterThan(0.6);
    expect(clip.cy).toBeLessThan(0.72);
    expect(clip.cx).toBeGreaterThan(0.42);
    expect(clip.cx).toBeLessThan(0.58);
    const solved = resolvePortraitAnimation(idle, idle, talk, width, height);
    expect(solved.mouthClip.cy).toBeGreaterThan(0.6);
    expect(solved.talk).toEqual(PORTRAIT_OFFSET_NONE);
  });

  it("finds lower visemes after the production crop", () => {
    const width = 80;
    const height = 120;
    const idle = rgbaSquare(width, height, 0, 0, width, height, 170);
    paintRect(idle, width, 28, 96, 24, 3, 18);
    const talk = new Uint8ClampedArray(idle);
    paintRect(talk, width, 30, 99, 20, 8, 230);
    const clip = detectPortraitMouthClip(idle, width, height, talk);
    expect(clip.cy).toBeGreaterThan(0.72);
    expect(clip.cy).toBeLessThan(0.9);
  });

  it("keeps generic mouth clips when detection latches onto a collar", () => {
    expect(choosePortraitMouthClip({ cx: 0.5, cy: 0.82, rx: 0.15, ry: 0.075 })).toEqual(
      PORTRAIT_MOUTH_CLIP,
    );
    const nearby = choosePortraitMouthClip({ cx: 0.49, cy: 0.63, rx: 0.15, ry: 0.075 });
    expect(nearby.cx).toBeCloseTo(0.49);
    expect(nearby.cy).toBeCloseTo(0.63);
    expect(nearby.rx).toBe(PORTRAIT_MOUTH_CLIP.rx);
    expect(nearby.cy - nearby.ry).toBeGreaterThanOrEqual(0.52);
  });

  it("keeps generic mouth clips when detection latches onto a nose", () => {
    expect(choosePortraitMouthClip({ cx: 0.5, cy: 0.53, rx: 0.15, ry: 0.075 })).toEqual(
      PORTRAIT_MOUTH_CLIP,
    );
    const lifted = choosePortraitMouthClip({ cx: 0.5, cy: 0.56, rx: 0.15, ry: 0.075 });
    expect(lifted.cy - lifted.ry).toBeGreaterThanOrEqual(0.52);
  });

  it("does not shift already-aligned portrait sheets", () => {
    const width = 48;
    const height = 48;
    const idle = rgbaSquare(width, height, 12, 10, 18, 16);
    const solved = resolvePortraitAnimation(idle, idle, idle, width, height);
    expect(portraitHasDrift(solved.blink)).toBe(false);
    expect(portraitHasDrift(solved.talk)).toBe(false);
    expect(solved.mouthClip.cy).toBeGreaterThanOrEqual(0.56);
    expect(solved.mouthClip.cy).toBeLessThanOrEqual(0.7);
    expect(solved.mouthClip.cy - solved.mouthClip.ry).toBeGreaterThanOrEqual(0.52);
    expect(solved.talk).toEqual(PORTRAIT_OFFSET_NONE);
  });

  it("crops each bitmap using its actual native sheet width", () => {
    expect(portraitFrameRect(1821, 864, 3, 2)).toEqual({ sx: 1214, sy: 0, sw: 607, sh: 864 });
    expect(portraitFrameRect(1536, 1024, 3, 2, 200, 240)).toEqual({
      sx: 1024,
      sy: 40.96,
      sw: 512,
      sh: 614.4,
    });
  });

  it("uses the renderer registration window for offline frame analysis", () => {
    expect(portraitRegistrationWindow(200, 240)).toEqual({ x0: 24, y0: 19, x1: 176, y1: 216 });
  });
});

function rgbaSquare(
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
  fill = 220,
  background = 12,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const on = px >= x && px < x + w && py >= y && py < y + h;
      const index = (py * width + px) * 4;
      const value = on ? fill : background;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return data;
}

function paintRect(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
): void {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      const index = (py * width + px) * 4;
      data[index] = fill;
      data[index + 1] = fill;
      data[index + 2] = fill;
    }
  }
}

import type { CharacterRole } from "../types";
import { type PortraitMouthCalibration, portraitMouthCalibration } from "./portraitCalibration";

export const PORTRAIT_FRAME_COUNT = 3;
export const PORTRAIT_FRAME_WIDTH = 512;
export const PORTRAIT_FRAME_HEIGHT = 1024;

export type PortraitAsset = {
  id: string;
  src: string;
  role: CharacterRole;
  sheet: number;
  feminine: boolean;
  frameCount: typeof PORTRAIT_FRAME_COUNT;
  frameWidth: typeof PORTRAIT_FRAME_WIDTH;
  frameHeight: typeof PORTRAIT_FRAME_HEIGHT;
  mouthCalibration: PortraitMouthCalibration;
};

const FEMININE_SHEETS: Record<CharacterRole, ReadonlySet<number>> = {
  commander: new Set([1, 3, 5]),
  advisor: new Set([1, 3, 5, 7, 9, 11]),
  enemyLeader: new Set([1, 3, 5]),
};

function createPortraitAssets(role: CharacterRole, prefix: string): PortraitAsset[] {
  const feminineSheets = FEMININE_SHEETS[role];
  return Array.from({ length: 12 }, (_, index) => {
    const sheet = index + 1;
    const number = String(sheet).padStart(2, "0");
    return {
      id: `${prefix}-${number}`,
      src: `/art/portraits/${prefix}-${number}.webp`,
      role,
      sheet,
      feminine: feminineSheets.has(sheet),
      frameCount: PORTRAIT_FRAME_COUNT,
      frameWidth: PORTRAIT_FRAME_WIDTH,
      frameHeight: PORTRAIT_FRAME_HEIGHT,
      mouthCalibration: portraitMouthCalibration(`${prefix}-${number}`),
    };
  });
}

export const PORTRAIT_ASSETS: readonly PortraitAsset[] = [
  ...createPortraitAssets("commander", "commander"),
  ...createPortraitAssets("advisor", "advisor"),
  ...createPortraitAssets("enemyLeader", "enemy-leader"),
];

const PORTRAIT_BY_ID = new Map(PORTRAIT_ASSETS.map((asset) => [asset.id, asset]));

export function getPortraitAsset(id: string): PortraitAsset | undefined {
  return PORTRAIT_BY_ID.get(id);
}

export function portraitSheetNumber(id: string): number {
  return getPortraitAsset(id)?.sheet ?? (Number.parseInt(id.slice(-2), 10) || 0);
}

export type PortraitPickOptions = {
  role?: CharacterRole;
  feminine?: boolean;
  excludeIds?: Iterable<string>;
  excludeSheets?: Iterable<number>;
};

export function portraitCandidates(opts: PortraitPickOptions = {}): readonly PortraitAsset[] {
  const excludedIds = opts.excludeIds ? new Set(opts.excludeIds) : undefined;
  const excludedSheets = opts.excludeSheets ? new Set(opts.excludeSheets) : undefined;
  const rolePool = opts.role
    ? PORTRAIT_ASSETS.filter((asset) => asset.role === opts.role)
    : PORTRAIT_ASSETS;
  const unused = rolePool.filter((asset) => {
    if (excludedIds?.has(asset.id)) return false;
    if (excludedSheets?.has(asset.sheet)) return false;
    return true;
  });
  const pool = unused.length > 0 ? unused : rolePool.filter((asset) => !excludedIds?.has(asset.id));
  if (opts.feminine === undefined) return pool;
  const presentation = pool.filter((asset) => asset.feminine === opts.feminine);
  return presentation.length > 0 ? presentation : pool;
}

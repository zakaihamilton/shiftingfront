import type { Owner } from "./entities";
import type { BiomeName, Facing, SurfaceKind } from "./map";

export type Palette = {
  primary: string;
  secondary: string;
  accent: string;
  outline: string;
  light: string;
  dark: string;
};

export type FactionVisualProfile = {
  designFamily: 0 | 1 | 2;
  material: "brushed" | "armored" | "industrial";
  trimPattern: 0 | 1 | 2 | 3;
  insignia: 0 | 1 | 2 | 3 | 4;
  weathering: 0 | 1 | 2 | 3;
  lightRig: "cyan" | "amber" | "red";
};

export type CampaignArtFamily = 0 | 1 | 2;

export type CampaignVisualProfile = {
  family: CampaignArtFamily;
  terrainTreatment: "modular" | "armored" | "expeditionary";
  terrainAccent: "cyan" | "amber" | "red";
};

export type Faction = {
  id: Owner;
  name: string;
  adjective: string;
  palette: Palette;
};

export type FaceDna = {
  portraitId: string;
  feminine: boolean;
};

export type CharacterRole = "commander" | "advisor" | "enemyLeader";

export type Character = {
  role: CharacterRole;
  name: string;
  title: string;
  face: FaceDna;
};

export type BriefingLine = {
  speaker: CharacterRole;
  text: string;
};

export type ShapeSpec = {
  type: "rect" | "ellipse" | "poly" | "diamond" | "line";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  alpha?: number;
  points?: number[];
};

export type SpriteCrop = {
  x: number;
  y: number;
  w: number;
  h: number;
  sourceW: number;
  sourceH: number;
  refW?: number;
  refH?: number;
};

export type SpriteSpec = {
  id: string;
  kind: "unit" | "building" | "tile";
  w: number;
  h: number;
  palette: Palette;
  shapes: ShapeSpec[];
  svg?: string;
  /** A project-local pre-rendered sprite. Kept optional for deterministic procedural fallbacks. */
  imageSrc?: string;
  /** Seeded campaign-grade color treatment composited over a pre-rendered sprite. */
  imageTint?: string;
  /** Optional source-image crop used to remove adjacent artwork from generated raster assets. */
  imageCrop?: SpriteCrop;
  /** Normalized source-image point that should sit on the sprite's logical anchor. */
  imageAnchorX?: number;
  imageAnchorY?: number;
  /** A subtle material plate composited into procedural terrain without replacing map geometry. */
  imageTextureSrc?: string;
  imageTextureOpacity?: number;
  imageTextureOffset?: number;
  /** How much of a raster, from the ground up, is visible. Used for building construction. */
  imageReveal?: number;
  /** Screen-space turn applied around the sprite anchor (used by raster units). */
  rotation?: number;
  anchorX?: number;
  anchorY?: number;
  pixelScale?: number;
};

export type TileContour = "none" | "bank" | "ridge";

export type TileSpriteOptions = {
  biome?: BiomeName;
  variant?: number;
  edgeMask?: number;
  /** Cardinal boundary mask for contiguous roads/pads; used to avoid cell-by-cell seams. */
  surfaceMask?: number;
  surface?: SurfaceKind;
  resourceLevel?: number;
  contour?: TileContour;
  campaignProfile?: CampaignVisualProfile;
};

export type AnimFrame = 0 | 1 | 2 | 3;

export type UnitSpriteOptions = {
  variant?: number;
  facing?: Facing;
  animationFrame?: AnimFrame;
  /** Selects the generated four-frame walk cycle for bipedal units. */
  motion?: "walk" | "idle" | "fire" | "treat";
  damageStage?: 0 | 1 | 2;
  profile?: FactionVisualProfile;
};

export type BuildingSpriteOptions = {
  variant?: number;
  animationFrame?: AnimFrame;
  damageStage?: 0 | 1 | 2;
  constructionStage?: 0 | 1 | 2 | 3;
  profile?: FactionVisualProfile;
};

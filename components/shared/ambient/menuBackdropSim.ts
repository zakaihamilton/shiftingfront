export { resetUnitTransformTracker } from "@/lib/render/gl/unitTransformTracker";
export type { PreviewPhase } from "./menuBackdropSim/cycle";
export {
  EXCLUDED_SCENARIO_KINDS,
  normalMissionIndices,
  PREVIEW_INITIAL_DELAY_MS,
  PREVIEW_LOCK_COUNT,
  PREVIEW_LOCK_IDS,
  PREVIEW_PLAY_MS,
  previewAt,
  previewMissionIndex,
  previewScenarioKind,
  previewSeed,
} from "./menuBackdropSim/cycle";
export { cinemaGroundWorld } from "./menuBackdropSim/paint";
export type {
  CinemaReadinessChecks,
  PreparedCinemaScene,
} from "./menuBackdropSim/readiness";
export {
  isCinemaSceneReady,
  PREVIEW_ATLAS_ROWS_PER_CHUNK,
  prepareCinemaScene,
} from "./menuBackdropSim/readiness";
export { renderCinemaFrame, stepCinemaScene } from "./menuBackdropSim/render";
export type { Actor, CinemaScene, Shot } from "./menuBackdropSim/scene";
export { CINEMA_SEED, createCinemaScene } from "./menuBackdropSim/scene";
export { cinemaShotCamera, PREVIEW_SHOT_COUNT } from "./menuBackdropSim/shots";

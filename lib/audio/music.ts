import { composeMusic, TITLE_MUSIC_SEED, TUTORIAL_MUSIC_MISSION, type MusicCue, type MusicIntensity } from "./compose";
import { peekAudioContext, unlockAudioContext } from "./context";
import { setAudioBusEnabled } from "./mixer";
import { masterGain } from "./musicGraph";
import {
  intensity,
  pendingIntensity,
  setIntensity,
  setPendingIntensity,
  graph,
  pattern,
  timer,
  setPattern,
  cue,
  seed,
  missionIndex,
  trackIndex,
  setTrackIndex,
  setTransitioning,
  enabled,
  setEnabled,
  setPaused,
  setCue,
  setSeed,
  setMissionIndex,
  setDucked,
  setStep,
} from "./musicState";
import {
  ensureMusicPlaying,
  applyPattern,
  stopMusic,
  readMusicPosition,
  saveMusicPosition,
  clearMusicPosition,
  getAudibleStep,
  saveAudibleMusicPosition,
  advanceMusicTrack,
  TOTAL_CAMPAIGN_TRACKS,
} from "./musicScheduler";

export { TITLE_MUSIC_SEED, TUTORIAL_MUSIC_MISSION };
export type { MusicIntensity } from "./compose";
export { isAudioUnlocked } from "./context";
export {
  readMusicPosition,
  saveMusicPosition,
  clearMusicPosition,
  getAudibleStep,
  saveAudibleMusicPosition,
  advanceMusicTrack,
  TOTAL_CAMPAIGN_TRACKS,
  trackIndex,
};

export function resetMusicPosition(targetCue?: MusicCue, targetSeed?: number, targetMissionIndex?: number): void {
  clearMusicPosition(targetCue, targetSeed, targetMissionIndex);
  if (
    targetCue === undefined ||
    (targetCue === cue &&
      (targetSeed === undefined || targetSeed === seed) &&
      (targetMissionIndex === undefined || targetMissionIndex === missionIndex))
  ) {
    setStep(0);
    setTransitioning(false);
    if (targetCue === undefined) {
      setCue("menu");
      setSeed(TITLE_MUSIC_SEED);
      setMissionIndex(0);
      setTrackIndex(0);
      setPattern(null);
    } else if (targetMissionIndex !== undefined) {
      setTrackIndex(targetMissionIndex);
    }
  }
}

export function musicCueFromPath(pathname: string): MusicCue | null {
  // Music is scoped to the active mission battlefield. Returning null on all
  // other routes lets AudioRoot stop any mission music during navigation.
  if (pathname.startsWith("/play")) return "mission";
  return null;
}

export function isMusicEnabled(): boolean {
  return enabled;
}

export function setMusicCue(nextCue: MusicCue, nextSeed: number, nextMissionIndex = 0): void {
  setPaused(false);
  if (cue === nextCue && seed === nextSeed && missionIndex === nextMissionIndex && pattern) {
    if (!timer) {
      const remembered = readMusicPosition(nextCue, nextSeed, nextMissionIndex);
      if (typeof remembered === "number") setStep(remembered);
    }
    setMusicIntensity("calm");
    ensureMusicPlaying();
    return;
  }
  setCue(nextCue);
  setSeed(nextSeed);
  setMissionIndex(nextMissionIndex);
  setTrackIndex(nextMissionIndex);
  setIntensity("calm");
  setPendingIntensity(null);
  const next = composeMusic(nextSeed, nextCue, nextMissionIndex);
  if (timer) applyPattern(next);
  else {
    const remembered = readMusicPosition(nextCue, nextSeed, nextMissionIndex);
    setStep(remembered ?? 0);
    setPattern(next);
  }
  ensureMusicPlaying();
}

export function setMusicEnabled(value: boolean): void {
  const enabledForRuntime = process.env.NEXT_PUBLIC_E2E_MUTE_MUSIC === "1" ? false : value;
  setEnabled(enabledForRuntime);
  setAudioBusEnabled("music", enabledForRuntime);
  if (!enabledForRuntime) stopMusic();
  else ensureMusicPlaying();
}

export function pauseMusic(): void {
  saveAudibleMusicPosition();
  setPaused(true);
  stopMusic();
}

export function setMusicDucked(value: boolean): void {
  setDucked(value);
  const audio = peekAudioContext();
  if (!audio || !graph) return;
  const now = audio.currentTime;
  graph.master.gain.cancelScheduledValues(now);
  graph.master.gain.setValueAtTime(Math.max(graph.master.gain.value, 0.001), now);
  graph.master.gain.linearRampToValueAtTime(masterGain(intensity, value), now + 0.1);
}

export function setMusicIntensity(value: MusicIntensity): void {
  const audio = peekAudioContext();
  if (!audio || !graph || !timer) {
    setIntensity(value);
    setPendingIntensity(null);
    return;
  }
  if (intensity === value && pendingIntensity === null) return;
  setPendingIntensity(value);
}

export function unlockAudio(): void {
  unlockAudioContext();
  ensureMusicPlaying();
}

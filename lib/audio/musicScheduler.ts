import { composeMusic, midiToHz, STEPS_PER_BAR, BARS_PER_SECTION, TUTORIAL_MUSIC_MISSION, type MusicIntensity, type MusicPattern, type MusicStem, type MusicVoiceType } from "./compose";
import { getAudioContext, peekAudioContext, resumeAudio } from "./context";
import { getAudioBus } from "./mixer";
import {
  createGraph,
  disconnectGraph,
  layerMultiplier,
  masterGain,
  padGainFor,
  SCHEDULE_AHEAD_S,
  SCHEDULER_MS,
  stemBus,
  indexPattern,
} from "./musicGraph";
import type { AudioGraphContext, MusicGraph } from "./musicGraph";
import { playSynthTone, playTransition, retunePad, schedulePadGate, syncDelay } from "./musicSynth";
import { playKick, playSnare, playClap, playHat, playTom, playImpact, playRim, playShaker } from "./musicDrums";
import {
  intensity,
  pendingIntensity,
  setIntensity,
  setPendingIntensity,
  graph,
  setGraph,
  pattern,
  setPattern,
  timer,
  setTimer,
  nextNoteTime,
  setNextNoteTime,
  step,
  setStep,
  enabled,
  paused,
  ducked,
  cue,
  seed,
  missionIndex,
  trackIndex,
  setTrackIndex,
  transitioning,
  setTransitioning,
  fadeGen,
  incrementFadeGen,
} from "./musicState";
import { readMusicPosition, saveMusicPosition, clearMusicPosition } from "./musicPosition";

export { readMusicPosition, saveMusicPosition, clearMusicPosition };

export const TOTAL_CAMPAIGN_TRACKS = 6;

export function advanceMusicTrack(): void {
  if (cue !== "mission" || missionIndex === TUTORIAL_MUSIC_MISSION || missionIndex < 0) return;
  const nextTrack = ((trackIndex < 0 ? 0 : trackIndex) + 1) % TOTAL_CAMPAIGN_TRACKS;
  setTrackIndex(nextTrack);
  const next = composeMusic(seed, cue, nextTrack);
  applyPattern(next);
}

export function applyIntensityAt(audio: AudioGraphContext, g: MusicGraph, value: MusicIntensity, time: number, isDucked = ducked): void {
  const t = Math.max(time, audio.currentTime);
  const ramp = value === "critical" ? 0.08 : 0.16;
  const set = (node: GainNode, target: number) => {
    node.gain.setTargetAtTime(target, t, ramp);
  };
  set(g.master, masterGain(value, isDucked));
  set(g.bassBus, value === "calm" ? 0.9 : value === "critical" ? 1.06 : 0.96);
  set(g.rhythmBus, value === "calm" ? 0.7 : value === "critical" ? 1.02 : 0.84);
  set(g.harmonyBus, value === "calm" ? 0.74 : value === "critical" ? 0.86 : 0.8);
  set(g.pulseBus, value === "calm" ? 0.74 : value === "critical" ? 0.96 : 0.84);
  set(g.leadBus, value === "calm" ? 0.9 : value === "critical" ? 1.04 : 0.98);
  set(g.counterBus, value === "calm" ? 0.38 : value === "critical" ? 0.66 : 0.5);
  set(g.fxBus, value === "critical" ? 0.7 : value === "engaged" ? 0.46 : 0.28);
  g.highpass.frequency.setTargetAtTime(value === "critical" ? 48 : 38, t, ramp);
  g.padFilter.frequency.setTargetAtTime(value === "critical" ? 1_300 : value === "engaged" ? 1_000 : 820, t, ramp);
  g.padBase = padGainFor(value);
  set(g.padGain, g.padBase);
}

export function shouldApplyPendingIntensity(step: number, pending: MusicIntensity | null): boolean {
  if (!pending) return false;
  if (pending === "critical") return step % 2 === 0;
  return step % STEPS_PER_BAR === 0;
}

function duckPad(audio: AudioGraphContext, g: MusicGraph, time: number): void {
  const t = Math.max(time, audio.currentTime);
  g.padGain.gain.cancelScheduledValues(t);
  g.padGain.gain.setValueAtTime(Math.max(0.001, g.padGain.gain.value), t);
  g.padGain.gain.linearRampToValueAtTime(g.padBase * 0.7, t + 0.025);
  g.padGain.gain.linearRampToValueAtTime(g.padBase, t + 0.16);
  const wetLevel = Math.max(0.001, g.padReverbGate.gain.value);
  g.padReverbGate.gain.cancelScheduledValues(t);
  g.padReverbGate.gain.setValueAtTime(wetLevel, t);
  g.padReverbGate.gain.linearRampToValueAtTime(wetLevel * 0.82, t + 0.025);
  g.padReverbGate.gain.linearRampToValueAtTime(wetLevel, t + 0.16);
}

function duckBass(audio: AudioGraphContext, g: MusicGraph, time: number): void {
  const t = Math.max(time, audio.currentTime);
  g.bassDuck.gain.cancelScheduledValues(t);
  g.bassDuck.gain.setValueAtTime(Math.max(0.001, g.bassDuck.gain.value), t);
  g.bassDuck.gain.linearRampToValueAtTime(0.78, t + 0.018);
  g.bassDuck.gain.linearRampToValueAtTime(1, t + 0.15);
}

export function scheduleStep(audio: AudioGraphContext, g: MusicGraph, p: MusicPattern, when: number, index: number, value: MusicIntensity): void {
  const stepDuration = 60 / p.bpm / 4;
  const t = when + (index % 2 === 1 ? p.swing * stepDuration : 0);
  const bar = Math.floor(index / STEPS_PER_BAR);
  const section = p.sections[Math.floor(bar / BARS_PER_SECTION)]?.name;
  if (index % STEPS_PER_BAR === 0) {
    retunePad(audio, g, p, bar, t);
    if (bar % BARS_PER_SECTION === BARS_PER_SECTION - 1 && bar < p.bars - 1) playTransition(audio, g, t + stepDuration * 5, stepDuration * 9, true);
    if (bar % BARS_PER_SECTION === 0 && bar > 0) playTransition(audio, g, t, stepDuration * 3, false);
  }

  const isBreakdown = section === "breakdown";
  schedulePadGate(audio, g, t, stepDuration, index, section, value);
  const stemVoices: Array<[MusicStem, MusicVoiceType, number]> = [
    ["bass", p.bassType, Math.min(p.cutoff, 620)],
    ["pulse", p.arpType, Math.min(p.cutoff + 180, 1600)],
    ["harmony", p.style.padType, Math.min(p.cutoff + 120, 1200)],
    ["counter", p.counterType, p.cutoff],
    ["melody", p.melodyType, p.cutoff + 360],
  ];
  for (const [stem, voice, cutoff] of stemVoices) {
    const events = g.index.notes[stem].get(index);
    if (!events) continue;
    for (const event of events) {
      const duration = Math.max(stepDuration * event.duration, stepDuration * (stem === "pulse" ? 0.55 : 0.7));
      playSynthTone(audio, g, stemBus(g, stem), midiToHz(event.midi), t, duration, voice, event.velocity * layerMultiplier(stem === "pulse" ? "pulse" : stem, value), cutoff, stem, !!event.accent);
      if (value === "critical" && stem === "bass" && event.accent) {
        playSynthTone(audio, g, g.bassBus, midiToHz(event.midi - 12), t, duration * 0.9, "triangle", event.velocity * 0.42, 340, "bass", true);
      }
    }
  }

  for (const event of g.index.drums.get(index) ?? []) {
    if (value === "calm" && isBreakdown && (event.kind === "tom" || event.kind === "impact")) continue;
    const velocity = event.velocity * layerMultiplier("drums", value);
    if (event.kind === "kick") {
      playKick(audio, g, t, velocity);
      if (event.accent && index % STEPS_PER_BAR === 0) {
        duckPad(audio, g, t);
        duckBass(audio, g, t);
      }
    } else if (event.kind === "snare") playSnare(audio, g, t, velocity, !!event.accent);
    else if (event.kind === "clap") playClap(audio, g, t, velocity, !!event.accent);
    else if (event.kind === "hat") playHat(audio, g, t, velocity, false);
    else if (event.kind === "openHat") playHat(audio, g, t, velocity, true);
    else if (event.kind === "tom") playTom(audio, g, t, velocity);
    else if (event.kind === "rim") playRim(audio, g, t, velocity);
    else if (event.kind === "shaker") playShaker(audio, g, t, velocity);
    else playImpact(audio, g, t, velocity);
  }
}

function applyPendingIntensityAtPhraseBoundary(audio: AudioContext, g: MusicGraph): void {
  const pi = pendingIntensity;
  if (!pi) return;
  setIntensity(pi);
  setPendingIntensity(null);
  applyIntensityAt(audio, g, intensity, nextNoteTime);
}

let lastPositionSaveMs = 0;
const POSITION_SAVE_INTERVAL_MS = 500;

export function getAudibleStep(): number {
  const p = pattern;
  const audio = peekAudioContext();
  if (!p || !audio || !graph || !timer) return step;
  const stepDuration = 60 / p.bpm / 4;
  const aheadSteps = Math.max(0, Math.round((nextNoteTime - audio.currentTime) / stepDuration));
  return (((step - aheadSteps) % p.steps) + p.steps) % p.steps;
}

export function saveAudibleMusicPosition(): void {
  if (!pattern) return;
  const current = getAudibleStep();
  saveMusicPosition(cue, seed, missionIndex, current);
}

function persistAudiblePositionThrottled(): void {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastPositionSaveMs < POSITION_SAVE_INTERVAL_MS) return;
  lastPositionSaveMs = now;
  saveAudibleMusicPosition();
}

function startGraph(audio: AudioContext): void {
  if (!pattern) return;
  setTransitioning(false);
  const musicBus = getAudioBus("music");
  if (!musicBus) return;
  const g = createGraph(audio, musicBus, pattern);
  setGraph(g);
  syncDelay(audio, g, pattern);
  applyIntensityAt(audio, g, intensity, audio.currentTime);

  const remembered = readMusicPosition(cue, seed, missionIndex);
  const startStep = typeof remembered === "number" && Number.isFinite(remembered)
    ? ((remembered % pattern.steps) + pattern.steps) % pattern.steps
    : step > 0
    ? step % pattern.steps
    : 0;

  const startBar = Math.floor(startStep / STEPS_PER_BAR);
  retunePad(audio, g, pattern, startBar, audio.currentTime);
  setNextNoteTime(audio.currentTime + 0.07);
  setStep(startStep);
  setTimer(window.setInterval(tickScheduler, SCHEDULER_MS));
  tickScheduler();
}

function tickScheduler(): void {
  const audio = getAudioContext();
  const g = graph;
  const p = pattern;
  if (!audio || !g || !p || transitioning) return;
  const stepDuration = 60 / p.bpm / 4;
  let n = nextNoteTime;
  let s = step;
  while (n < audio.currentTime + SCHEDULE_AHEAD_S) {
    if (shouldApplyPendingIntensity(s, pendingIntensity)) applyPendingIntensityAtPhraseBoundary(audio, g);
    scheduleStep(audio, g, p, n, s, intensity);
    const prev = s;
    n += stepDuration;
    s = (s + 1) % p.steps;
    if (prev === p.steps - 1 && s === 0 && cue === "mission" && missionIndex !== TUTORIAL_MUSIC_MISSION && missionIndex >= 0) {
      setNextNoteTime(n);
      setStep(0);
      advanceMusicTrack();
      return;
    }
  }
  setNextNoteTime(n);
  setStep(s);
  persistAudiblePositionThrottled();
}

function stopMusic(): void {
  setTransitioning(false);
  saveAudibleMusicPosition();
  incrementFadeGen();
  const t = timer;
  if (t) {
    window.clearInterval(t);
    setTimer(null);
  }
  const g = graph;
  if (g) {
    disconnectGraph(g);
    setGraph(null);
  }
}

if (typeof window !== "undefined") {
  const onUnload = () => {
    saveAudibleMusicPosition();
  };
  window.addEventListener("beforeunload", onUnload);
  window.addEventListener("pagehide", onUnload);
}

export function ensureMusicPlaying(): void {
  if (!enabled || paused) return;
  // A browser can suspend an already-created context after tab switches or
  // OS audio-device changes. Always ask the unlocked context to resume before
  // checking the scheduler so an existing timer cannot leave the soundtrack
  // silent forever.
  const audio = resumeAudio();
  if (!audio) return;
  if (!pattern) setPattern(composeMusic(seed, cue, missionIndex));
  if (timer) return;
  startGraph(audio);
}

export function applyPattern(next: MusicPattern): void {
  const audio = getAudioContext();
  const g = graph;
  if (!audio || !g || !timer) {
    setPattern(next);
    setStep(0);
    setTransitioning(false);
    return;
  }
  setTransitioning(true);
  const generation = incrementFadeGen();
  const now = audio.currentTime;
  const half = 0.55 / 2;
  const current = Math.max(g.master.gain.value, 0.001);
  g.master.gain.cancelScheduledValues(now);
  g.master.gain.setValueAtTime(current, now);
  g.master.gain.linearRampToValueAtTime(0.001, now + half);
  window.setTimeout(() => {
    if (generation !== fadeGen) {
      setTransitioning(false);
      return;
    }
    setPattern(next);
    const activeGraph = graph;
    if (!activeGraph) {
      setTransitioning(false);
      return;
    }
    activeGraph.index = indexPattern(next);
    setStep(0);
    syncDelay(audio, activeGraph, next);
    retunePad(audio, activeGraph, next, 0, audio.currentTime);
    const t = audio.currentTime;
    setNextNoteTime(t + 0.07);
    activeGraph.master.gain.cancelScheduledValues(t);
    activeGraph.master.gain.setValueAtTime(0.001, t);
    activeGraph.master.gain.linearRampToValueAtTime(masterGain(intensity, ducked), t + half);
    setTransitioning(false);
  }, half * 1000);
}

export { stopMusic, tickScheduler };

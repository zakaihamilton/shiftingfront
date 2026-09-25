import { isAudioUnlocked, getAudioContext } from "./context";
import * as synthModule from "./synth";
import { tone, noise } from "./synth/nodes";
import * as mixerModule from "./mixer";

export type VoiceBarkType = "select" | "move" | "attack" | "harvest" | "threat";

function checkSfxEnabled(): boolean {
  try {
    return typeof synthModule.isSfxEnabled === "function" ? synthModule.isSfxEnabled() : true;
  } catch {
    return true;
  }
}

function getSfxBus(): AudioNode | null {
  try {
    return typeof mixerModule.getAudioBus === "function" ? mixerModule.getAudioBus("sfx") : null;
  } catch {
    return null;
  }
}

let windowActive = true;

export function setVoiceWindowActiveForTests(active: boolean): void {
  windowActive = active;
}

export function isVoiceForeground(): boolean {
  if (typeof document !== "undefined" && document.hidden) {
    return false;
  }
  return windowActive;
}

export function cancelVoiceSpeech(): void {
  const synth = (typeof window !== "undefined" && window.speechSynthesis)
    ? window.speechSynthesis
    : (globalThis as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  try {
    synth?.cancel?.();
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  window.addEventListener?.("blur", () => {
    windowActive = false;
    cancelVoiceSpeech();
  });
  window.addEventListener?.("focus", () => {
    windowActive = true;
  });
  if (typeof document !== "undefined") {
    document.addEventListener?.("visibilitychange", () => {
      if (document.hidden) {
        windowActive = false;
        cancelVoiceSpeech();
      } else {
        windowActive = true;
      }
    });
  }
}

const BARK_PHRASES: Record<VoiceBarkType, string[]> = {
  select: ["Standing by.", "Unit ready.", "Awaiting orders.", "Reporting in."],
  move: ["Acknowledged.", "Moving out.", "Affirmative.", "Coordinates set."],
  attack: ["Engaging target.", "Weapons free.", "Target acquired.", "Commencing attack."],
  harvest: ["Harvesting ore.", "Heading to field.", "Extraction in progress."],
  threat: ["Base under attack!", "Warning: perimeter breached!"],
};

let voiceEnabled = true;
let voiceVolume = 0.8;
let lastBarkTime = 0;
const MIN_BARK_INTERVAL_MS = 2200;

export function setVoiceEnabled(value: boolean): void {
  voiceEnabled = value;
  if (!value) cancelVoiceSpeech();
}

export function isVoiceEnabled(): boolean {
  return voiceEnabled;
}

function getMixerLevels(): mixerModule.AudioLevels | undefined {
  try {
    return typeof mixerModule.getAudioLevels === "function" ? mixerModule.getAudioLevels() : undefined;
  } catch {
    return undefined;
  }
}

function setMixerVoiceLevel(vol: number): void {
  try {
    if (typeof mixerModule.setAudioLevels === "function") {
      mixerModule.setAudioLevels({ voiceVolume: vol });
    }
  } catch {
    /* ignore */
  }
}

export function setVoiceVolume(value: number): void {
  voiceVolume = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.8));
  setMixerVoiceLevel(voiceVolume);
}

export function getVoiceVolume(): number {
  const levels = getMixerLevels();
  return levels?.voiceVolume ?? voiceVolume;
}

export function getEffectiveVoiceVolume(): number {
  const levels = getMixerLevels();
  const masterVol = levels?.masterVolume ?? 1;
  const vVol = levels?.voiceVolume ?? voiceVolume;
  return Math.max(0, Math.min(1, vVol * masterVol));
}

export function resetVoiceCooldown(): void {
  lastBarkTime = 0;
}

/** Play a crisp walkie-talkie burst squelch before vocal transmission. */
function playRadioSquelch(): void {
  if (!checkSfxEnabled() || !isAudioUnlocked()) return;
  const audio = getAudioContext();
  const dest = getSfxBus();
  if (!audio || !dest) return;

  // The SFX bus applies master volume downstream, so only scale the voice
  // level here. Applying getEffectiveVoiceVolume() would apply master twice.
  const voiceVol = getVoiceVolume();
  if (voiceVol <= 0) return;
  const gainScale = voiceVol / 0.8;

  // Initial RF burst click
  noise(audio, dest, {
    frequency: 3200,
    duration: 0.035,
    gain: 0.05 * gainScale,
    pan: 0,
    type: "bandpass",
    q: 2.0,
  });
  // Roger beep carrier chirp
  tone(audio, dest, {
    frequency: 1800,
    endFrequency: 2400,
    duration: 0.03,
    type: "sine",
    gain: 0.03 * gainScale,
    pan: 0,
    cutoff: 3500,
    delay: 0.015,
  });
}

/**
 * Trigger a tactical military radio voice bark with radio squelch.
 * Safely throttled and gracefully no-ops in headless/test environments.
 */
export function playVoiceBark(type: VoiceBarkType, force = false): void {
  if (!voiceEnabled || !isVoiceForeground()) return;
  const effectiveVol = getEffectiveVoiceVolume();
  if (effectiveVol <= 0) return;

  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (!force && now - lastBarkTime < MIN_BARK_INTERVAL_MS) return;
  lastBarkTime = now;

  // Always play the procedural walkie-talkie squelch
  playRadioSquelch();

  // If SpeechSynthesis is available in the browser/environment, speak the military phrase
  const synth = (typeof window !== "undefined" && window.speechSynthesis)
    ? window.speechSynthesis
    : (globalThis as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  const UtteranceClass = (typeof window !== "undefined" && window.SpeechSynthesisUtterance)
    ? window.SpeechSynthesisUtterance
    : (globalThis as unknown as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;

  if (synth && UtteranceClass) {
    try {
      const phrases = BARK_PHRASES[type];
      const text = phrases[Math.floor(Math.random() * phrases.length)] ?? phrases[0]!;

      synth.cancel();
      const utterance = new UtteranceClass(text);
      utterance.rate = 1.18;
      utterance.pitch = 0.92;
      utterance.volume = effectiveVol;
      utterance.lang = "en-US";

      const voices = synth.getVoices?.() ?? [];
      const englishVoice = voices.find(
        (v) => v.lang.startsWith("en") && !v.name.includes("Whisper"),
      );
      if (englishVoice) utterance.voice = englishVoice;

      synth.speak(utterance);
    } catch {
      // Ignore speech synthesis errors in restricted environments
    }
  }
}

/** Convenience bridge that maps BeepKind to the corresponding tactical radio bark. */
export function voiceBarkForBeep(kind: import("./synth/types").BeepKind | undefined): void {
  if (!kind) return;
  if (kind === "select") playVoiceBark("select");
  else if (kind === "ack") playVoiceBark("move");
  else if (kind === "ackAttack") playVoiceBark("attack");
  else if (kind === "ackHarvest") playVoiceBark("harvest");
  else if (kind === "alert") playVoiceBark("threat");
}


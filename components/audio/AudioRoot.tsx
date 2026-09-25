"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  TITLE_MUSIC_SEED,
  TUTORIAL_MUSIC_MISSION,
  musicCueFromPath,
  pauseMusic,
  setMusicCue,
  setMusicEnabled,
  isAudioUnlocked,
  unlockAudio,
  saveAudibleMusicPosition,
} from "@/lib/audio/music";
import { setSfxEnabled } from "@/lib/audio/synth";
import { setVoiceEnabled, setVoiceVolume } from "@/lib/audio/voice";
import { setAudioForeground, setAudioLevels } from "@/lib/audio/mixer";
import { cachedLocalStorage } from "@/lib/persist/save";
import { readSettings } from "@/lib/persist/settings";
import { parseSeed } from "@/lib/seed/rng";

function AudioRootInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const seedParam = searchParams.get("seed");
  const missionParam = searchParams.get("mission");

  useEffect(() => {
    const settings = readSettings(cachedLocalStorage());
    setAudioLevels(settings);
    setSfxEnabled(settings.sfxEnabled);
    setMusicEnabled(settings.musicEnabled);
    setVoiceEnabled(settings.voiceEnabled);
    setVoiceVolume(settings.voiceVolume);
  }, []);

  useEffect(() => {
    const cue = musicCueFromPath(pathname);
    if (!cue) {
      pauseMusic();
      return;
    }
    const parsed = parseSeed(seedParam ?? "");
    const missionIndex = pathname.startsWith("/tutorial")
      ? TUTORIAL_MUSIC_MISSION
      : Math.max(0, Number(missionParam ?? "0") || 0);
    setMusicCue(cue, parsed ?? TITLE_MUSIC_SEED, missionIndex);
  }, [pathname, seedParam, missionParam]);

  useEffect(() => {
    const unlockEvents = ["pointerdown", "keydown", "touchstart"] as const;
    const unlock = () => unlockAudio();
    let documentVisible = !document.hidden;
    let windowFocused = document.hasFocus();
    const setForeground = (value: boolean) => {
      setAudioForeground(value);
      if (value && isAudioUnlocked()) unlockAudio();
      else if (!value) saveAudibleMusicPosition();
    };
    const updateForeground = () => setForeground(documentVisible && windowFocused);
    const onVisibility = () => {
      documentVisible = !document.hidden;
      updateForeground();
    };
    const onBlur = () => {
      windowFocused = false;
      updateForeground();
    };
    const onFocus = () => {
      windowFocused = true;
      updateForeground();
    };
    updateForeground();
    // Capture input before game controls can stop propagation. Keep these
    // listeners for the lifetime of the root so a suspended or failed context
    // can be retried by a later user gesture.
    for (const eventName of unlockEvents) {
      document.addEventListener(eventName, unlock, true);
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      for (const eventName of unlockEvents) {
        document.removeEventListener(eventName, unlock, true);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}

export function AudioRoot() {
  return (
    <Suspense fallback={null}>
      <AudioRootInner />
    </Suspense>
  );
}

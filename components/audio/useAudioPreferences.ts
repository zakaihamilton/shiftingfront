import { useCallback, type Dispatch, type SetStateAction } from "react";
import { setMusicEnabled as applyMusicEnabled } from "@/lib/audio/music";
import { setSfxEnabled as applySfxEnabled } from "@/lib/audio/synth";
import { setAudioLevels, type AudioVolumeKey } from "@/lib/audio/mixer";
import { cachedLocalStorage } from "@/lib/persist/save";
import { writeSettings, type ColorblindMode, type GameSettings, type KeyBindings } from "@/lib/persist/settings";

export function useAudioPreferences(
  settings: GameSettings,
  setSettings: Dispatch<SetStateAction<GameSettings>>,
) {
  const toggleSound = useCallback(() => {
    const next = { ...settings, sfxEnabled: !settings.sfxEnabled };
    setSettings(next);
    applySfxEnabled(next.sfxEnabled);
    writeSettings(cachedLocalStorage(), next);
  }, [setSettings, settings]);

  const toggleMusic = useCallback(() => {
    const next = { ...settings, musicEnabled: !settings.musicEnabled };
    setSettings(next);
    applyMusicEnabled(next.musicEnabled);
    writeSettings(cachedLocalStorage(), next);
  }, [setSettings, settings]);

  const updateVolume = useCallback((key: AudioVolumeKey, value: number) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    setAudioLevels(next);
    writeSettings(cachedLocalStorage(), next);
  }, [setSettings, settings]);

  const toggleReducedMotion = useCallback(() => {
    const next = { ...settings, reducedMotion: !settings.reducedMotion };
    setSettings(next);
    writeSettings(cachedLocalStorage(), next);
  }, [setSettings, settings]);

  const toggleHighContrast = useCallback(() => {
    const next = { ...settings, highContrast: !settings.highContrast };
    setSettings(next);
    writeSettings(cachedLocalStorage(), next);
  }, [setSettings, settings]);

  const cycleColorblind = useCallback(() => {
    const modes: ColorblindMode[] = ["none", "deuteranopia", "protanopia", "tritanopia"];
    const currentIndex = modes.indexOf(settings.colorblindMode ?? "none");
    const nextMode = modes[(currentIndex + 1) % modes.length]!;
    const next = { ...settings, colorblindMode: nextMode };
    setSettings(next);
    writeSettings(cachedLocalStorage(), next);
  }, [setSettings, settings]);

  const updateKeyBindings = useCallback((keyBindings: KeyBindings) => {
    const next = { ...settings, keyBindings };
    setSettings(next);
    writeSettings(cachedLocalStorage(), next);
  }, [setSettings, settings]);

  return {
    toggleSound,
    toggleMusic,
    toggleReducedMotion,
    toggleHighContrast,
    cycleColorblind,
    updateKeyBindings,
    updateVolume,
  };
}

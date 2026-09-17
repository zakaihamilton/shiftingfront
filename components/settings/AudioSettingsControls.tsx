import type { AudioVolumeKey } from "@/lib/audio/mixer";
import type { GameSettings } from "@/lib/persist/settings";
import styles from "./SettingsPanel.module.css";

const CONTROLS: { key: AudioVolumeKey; label: string }[] = [
  { key: "masterVolume", label: "Master" },
  { key: "musicVolume", label: "Music" },
  { key: "sfxVolume", label: "Effects" },
];

export function AudioSettingsControls({ settings, onChange }: { settings: GameSettings; onChange: (key: AudioVolumeKey, value: number) => void }) {
  return (
    <div className={styles.volumeControls} aria-label="Volume controls">
      {CONTROLS.map(({ key, label }) => {
        const value = settings[key];
        return (
          <label key={key} className={styles.volumeControl}>
            <span className={styles.volumeLabel}><span>{label}</span><output>{Math.round(value * 100)}%</output></span>
            <input className={styles.volumeRange} type="range" min="0" max="1" step="0.05" value={value} aria-label={`${label} volume`} onChange={(event) => onChange(key, Number(event.currentTarget.value))} />
          </label>
        );
      })}
    </div>
  );
}

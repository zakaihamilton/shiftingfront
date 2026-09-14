import { MetalPanel } from "@/components/ui/MetalPanel";
import { PauseOptions } from "@/components/game/PauseOptions";
import type { AudioVolumeKey } from "@/lib/audio/mixer";
import type { GameSettings } from "@/lib/persist/settings";
import pauseStyles from "@/components/game/PauseMenu.module.css";

export function MenuOptions({
  settings,
  onToggleSound,
  onToggleMusic,
  onToggleReducedMotion,
  onToggleHighContrast,
  onVolumeChange,
  onBack,
}: {
  settings: GameSettings;
  onToggleSound: () => void;
  onToggleMusic: () => void;
  onToggleReducedMotion?: () => void;
  onToggleHighContrast?: () => void;
  onVolumeChange: (key: AudioVolumeKey, value: number) => void;
  onBack: () => void;
}) {
  return (
    <MetalPanel
      className={pauseStyles.dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-options-title"
    >
      <PauseOptions
        titleId="menu-options-title"
        settings={settings}
        onToggleSound={onToggleSound}
        onToggleMusic={onToggleMusic}
        onToggleReducedMotion={onToggleReducedMotion}
        onToggleHighContrast={onToggleHighContrast}
        onVolumeChange={onVolumeChange}
        onBack={onBack}
        backTooltip="Return to the main menu"
      />
      <p className={pauseStyles.hint}>U toggles music · M toggles sound · Escape returns</p>
    </MetalPanel>
  );
}

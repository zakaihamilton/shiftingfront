import { MetalPanel } from "@/components/ui/MetalPanel";
import { PauseOptions } from "@/components/settings/PauseOptions";
import type { AudioVolumeKey } from "@/lib/audio/mixer";
import type { GameSettings } from "@/lib/persist/settings";
import settingsStyles from "@/components/settings/SettingsPanel.module.css";

export function MenuOptions({
  settings,
  onToggleSound,
  onToggleMusic,
  onToggleReducedMotion,
  onToggleHighContrast,
  onCycleColorblind,
  onUpdateKeyBindings,
  onVolumeChange,
  onBack,
}: {
  settings: GameSettings;
  onToggleSound: () => void;
  onToggleMusic: () => void;
  onToggleReducedMotion?: () => void;
  onToggleHighContrast?: () => void;
  onCycleColorblind?: () => void;
  onUpdateKeyBindings?: (bindings: import("@/lib/persist/settings").KeyBindings) => void;
  onVolumeChange: (key: AudioVolumeKey, value: number) => void;
  onBack: () => void;
}) {
  return (
    <MetalPanel
      className={settingsStyles.dialog}
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
        onCycleColorblind={onCycleColorblind}
        onUpdateKeyBindings={onUpdateKeyBindings}
        onVolumeChange={onVolumeChange}
        onBack={onBack}
        backTooltip="Return to the main menu"
      />
      <p className={settingsStyles.hint}>U toggles music · M toggles sound · Escape returns</p>
    </MetalPanel>
  );
}

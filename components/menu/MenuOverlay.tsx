import type { RefObject } from "react";
import type { AudioVolumeKey } from "@/lib/audio/mixer";
import type { GameSettings } from "@/lib/persist/settings";
import type { Campaign } from "@/lib/types";
import { MenuOptions } from "./MenuOptions";
import { NewGameSetup } from "./NewGameSetup";
import styles from "./MenuOverlay.module.css";

export type MenuView = "main" | "newGame" | "options";

export function MenuOverlay({
  view,
  code,
  error,
  previewLine,
  preview,
  copied,
  inputRef,
  settings,
  onChange,
  onRandomize,
  onThisWeek,
  onCopyLink,
  onLaunch,
  onToggleSound,
  onToggleMusic,
  onToggleReducedMotion,
  onToggleHighContrast,
  onVolumeChange,
  onBack,
}: {
  view: MenuView;
  code: string;
  error: string;
  previewLine: string;
  preview: Campaign | null;
  copied: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  settings: GameSettings;
  onChange: (value: string) => void;
  onRandomize: () => void;
  onThisWeek: () => void;
  onCopyLink: () => void;
  onLaunch: () => void;
  onToggleSound: () => void;
  onToggleMusic: () => void;
  onToggleReducedMotion?: () => void;
  onToggleHighContrast?: () => void;
  onVolumeChange: (key: AudioVolumeKey, value: number) => void;
  onBack: () => void;
}) {
  if (view === "main") return null;

  return (
    <div className={styles.overlay} data-testid="menu-overlay" data-view={view}>
      {view === "newGame" ? (
        <div className={styles.deployStage}>
          <NewGameSetup
            code={code}
            error={error}
            previewLine={previewLine}
            preview={preview}
            copied={copied}
            inputRef={inputRef}
            onChange={onChange}
            onRandomize={onRandomize}
            onThisWeek={onThisWeek}
            onCopyLink={onCopyLink}
            onLaunch={onLaunch}
            onBack={onBack}
          />
        </div>
      ) : (
        <MenuOptions
          settings={settings}
          onToggleSound={onToggleSound}
          onToggleMusic={onToggleMusic}
          onToggleReducedMotion={onToggleReducedMotion}
          onToggleHighContrast={onToggleHighContrast}
          onVolumeChange={onVolumeChange}
          onBack={onBack}
        />
      )}
    </div>
  );
}

import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { useFullscreen } from "@/lib/ui/fullscreen";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import styles from "./PauseMenu.module.css";

export function PauseMainMenu({
  onResume,
  tutorial,
  onSave,
  onLoad,
  onBriefing,
  onRestart,
  onControls,
  onOptions,
  onMenu,
}: {
  onResume: () => void;
  tutorial: boolean;
  onSave: () => void;
  onLoad: () => void;
  onBriefing: () => void;
  onRestart: () => void;
  onControls: () => void;
  onOptions: () => void;
  onMenu: () => void;
}) {
  const fullscreen = useFullscreen();

  return (
    <>
      <ConsoleLabel>Shifting Front</ConsoleLabel>
      <h2 id="pause-title" className={styles.title}>Game paused</h2>
      <div className={styles.actions}>
        <ConsoleButton className={styles.action} tooltip="Return to the battlefield" shortcut={SHORTCUT.resume} onClick={onResume}>Resume Mission</ConsoleButton>
        {!tutorial ? (
          <div className={styles.group}>
            <ConsoleLabel className={styles.groupLabel}>Mission</ConsoleLabel>
            <ConsoleButton className={styles.action} tooltip="Write a named save slot" shortcut={SHORTCUT.save} onClick={onSave}>Save Mission</ConsoleButton>
            <ConsoleButton className={styles.action} tooltip="Load a named save slot or autosave" shortcut={SHORTCUT.load} onClick={onLoad}>Load Mission</ConsoleButton>
          </div>
        ) : null}
        <div className={styles.group}>
          <ConsoleLabel className={styles.groupLabel}>Operation</ConsoleLabel>
          {!tutorial ? <ConsoleButton className={styles.action} tooltip="Open the mission briefing" shortcut={SHORTCUT.briefing} onClick={onBriefing}>Mission Briefing</ConsoleButton> : null}
          <ConsoleButton className={styles.action} tooltip="Start this mission over from the beginning" shortcut={SHORTCUT.restart} onClick={onRestart}>Restart Mission</ConsoleButton>
          <ConsoleButton className={styles.action} tooltip="Keyboard and pointer reference" shortcut={SHORTCUT.controls} onClick={onControls}>Controls</ConsoleButton>
        </div>
        <div className={styles.group}>
          <ConsoleLabel className={styles.groupLabel}>Campaign</ConsoleLabel>
          {fullscreen.isSupported ? (
            <ConsoleButton
              className={styles.action}
              tooltip="Toggle browser fullscreen"
              onClick={fullscreen.toggle}
            >
              Fullscreen: {fullscreen.isFullscreen ? "On" : "Off"}
            </ConsoleButton>
          ) : null}
          <ConsoleButton className={styles.action} tooltip="Audio, display, and data options" shortcut={SHORTCUT.options} onClick={onOptions}>Options</ConsoleButton>
          <ConsoleButton muted className={styles.action} tooltip="Leave the campaign" shortcut={SHORTCUT.menu} onClick={onMenu}>Main Menu</ConsoleButton>
        </div>
      </div>
    </>
  );
}

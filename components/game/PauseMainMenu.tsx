import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import styles from "./PauseMenu.module.css";

export function PauseMainMenu({
  onResume,
  tutorial,
  multiplayer = false,
  onSave,
  onLoad,
  onBriefing,
  onRestart,
  onControls,
  onOptions,
  onFieldGuide,
  onMenu,
}: {
  onResume: () => void;
  tutorial: boolean;
  multiplayer?: boolean;
  onSave: () => void;
  onLoad: () => void;
  onBriefing: () => void;
  onRestart: () => void;
  onControls: () => void;
  onOptions: () => void;
  onFieldGuide: () => void;
  onMenu: () => void;
}) {
  return (
    <>
      <ConsoleLabel>Shifting Front</ConsoleLabel>
      <h2 id="pause-title" className={styles.title}>{multiplayer ? "Skirmish Menu" : "Game paused"}</h2>
      <div className={styles.actions}>
        <ConsoleButton className={styles.action} tooltip="Return to the battlefield" shortcut={SHORTCUT.resume} onClick={onResume}>Resume Mission</ConsoleButton>
        {!tutorial && !multiplayer ? (
          <div className={styles.group}>
            <ConsoleLabel className={styles.groupLabel}>Mission</ConsoleLabel>
            <ConsoleButton className={styles.action} tooltip="Write a named save slot" shortcut={SHORTCUT.save} onClick={onSave}>Save Mission</ConsoleButton>
            <ConsoleButton className={styles.action} tooltip="Load a named save slot or autosave" shortcut={SHORTCUT.load} onClick={onLoad}>Load Mission</ConsoleButton>
          </div>
        ) : null}
        <div className={styles.group}>
          <ConsoleLabel className={styles.groupLabel}>Operation</ConsoleLabel>
          {!tutorial && !multiplayer ? <ConsoleButton className={styles.action} tooltip="Open the mission briefing" shortcut={SHORTCUT.briefing} onClick={onBriefing}>Mission Briefing</ConsoleButton> : null}
          {!multiplayer ? <ConsoleButton className={styles.action} tooltip="Start this mission over from the beginning" shortcut={SHORTCUT.restart} onClick={onRestart}>Restart Mission</ConsoleButton> : null}
          <ConsoleButton className={styles.action} tooltip="Keyboard and pointer reference" shortcut={SHORTCUT.controls} onClick={onControls}>Controls</ConsoleButton>
        </div>
        <div className={styles.group}>
          <ConsoleLabel className={styles.groupLabel}>{multiplayer ? "Online skirmish" : "Campaign"}</ConsoleLabel>
          <ConsoleButton className={styles.action} tooltip="Audio, display, and data options" shortcut={SHORTCUT.options} onClick={onOptions}>Options</ConsoleButton>
          {!multiplayer ? <ConsoleButton className={styles.action} tooltip="Review scenario procedures and biome rules" onClick={onFieldGuide}>Field Guide</ConsoleButton> : null}
          <ConsoleButton muted className={styles.action} tooltip={multiplayer ? "Leave the online skirmish" : "Leave the campaign"} shortcut={SHORTCUT.menu} onClick={onMenu}>{multiplayer ? "Leave Skirmish" : "Main Menu"}</ConsoleButton>
        </div>
      </div>
    </>
  );
}

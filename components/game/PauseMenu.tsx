"use client";

import { MetalPanel } from "@/components/ui/MetalPanel";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { useModalFocus } from "@/components/ui/useModalFocus";
import type { AudioVolumeKey } from "@/lib/audio/mixer";
import type { ArchiveEntry, SlotMeta } from "@/lib/persist/save";
import type { GameSettings, KeyBindings } from "@/lib/persist/settings";
import type { PauseView } from "@/lib/ui/shortcuts";
import type { FieldGuideTopic } from "@/lib/fieldGuide";
import { PauseControls } from "./PauseControls";
import { PauseDiagnostics } from "./PauseDiagnostics";
import { PauseFieldGuide } from "./PauseFieldGuide";
import { PauseLoadSlots } from "./PauseLoadSlots";
import { PauseMainMenu } from "./PauseMainMenu";
import { PauseOptions } from "@/components/settings/PauseOptions";
import { PauseSaveSlots } from "./PauseSaveSlots";
import styles from "./PauseMenu.module.css";

export function PauseMenu({
  view,
  notice,
  settings,
  tutorial = false,
  saveSlots,
  loadEntries,
  defaultSlotName,
  onResume,
  onSave,
  onLoad,
  onCommitSave,
  onLoadEntry,
  onDeleteEntry,
  onBriefing,
  onRestart,
  onControls,
  onDiagnostics,
  onBackToOptions,
  onOptions,
  onMenu,
  onLeaveWithoutSave,
  onToggleSound,
  onToggleMusic,
  onToggleVoice,
  onToggleReducedMotion,
  onToggleHighContrast,
  onCycleColorblind,
  onCycleHudScale,
  onUpdateKeyBindings,
  onVolumeChange,
  onMarkFieldGuideTopicSeen,
  onFieldGuide,
  telemetryRecordCount,
  onExportTelemetry,
  onClearTelemetry,
  onBack,
}: {
  view: PauseView;
  notice: string;
  settings: GameSettings;
  tutorial?: boolean;
  saveSlots: SlotMeta[];
  loadEntries: ArchiveEntry[];
  defaultSlotName: string;
  onResume: () => void;
  onSave: () => void;
  onLoad: () => void;
  onCommitSave: (name: string, overwriteId: string | null) => boolean;
  onLoadEntry: (entry: ArchiveEntry) => void;
  onDeleteEntry?: (entry: ArchiveEntry) => void;
  onBriefing: () => void;
  onRestart: () => void;
  onControls: () => void;
  onDiagnostics?: () => void;
  onBackToOptions: () => void;
  onOptions: () => void;
  onMenu: () => void;
  onLeaveWithoutSave?: () => void;
  onToggleSound: () => void;
  onToggleMusic: () => void;
  onToggleVoice?: () => void;
  onToggleReducedMotion?: () => void;
  onToggleHighContrast?: () => void;
  onCycleColorblind?: () => void;
  onCycleHudScale?: () => void;
  onUpdateKeyBindings?: (bindings: KeyBindings) => void;
  onVolumeChange: (key: AudioVolumeKey, value: number) => void;
  onMarkFieldGuideTopicSeen?: (topic: FieldGuideTopic) => void;
  onFieldGuide?: () => void;
  telemetryRecordCount?: number;
  onExportTelemetry?: () => boolean;
  onClearTelemetry?: () => boolean;
  onBack: () => void;
}) {
  const dialogRef = useModalFocus(true, view, "dialog");
  return (
    <div className={styles.overlay} data-testid="pause-menu">
      <MetalPanel
        ref={dialogRef}
        tabIndex={-1}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
      >
        {view === "main" ? (
          <PauseMainMenu
            onResume={onResume}
            tutorial={tutorial}
            onSave={onSave}
            onLoad={onLoad}
            onBriefing={onBriefing}
            onRestart={onRestart}
            onControls={onControls}
            onOptions={onOptions}
            onFieldGuide={() => onFieldGuide?.()}
            onMenu={onMenu}
          />
        ) : view === "controls" ? (
          <PauseControls onBack={onBack} />
        ) : view === "diagnostics" ? (
          <PauseDiagnostics
            telemetryRecordCount={telemetryRecordCount}
            onExportTelemetry={onExportTelemetry}
            onClearTelemetry={onClearTelemetry}
            onBack={onBackToOptions}
          />
        ) : view === "save" ? (
          <PauseSaveSlots
            defaultName={defaultSlotName}
            slots={saveSlots}
            onCommit={onCommitSave}
            onDelete={onDeleteEntry}
            onBack={onBack}
          />
        ) : view === "load" ? (
          <PauseLoadSlots
            entries={loadEntries}
            onLoad={onLoadEntry}
            onDelete={onDeleteEntry}
            onBack={onBack}
          />
        ) : view === "fieldGuide" ? (
          <PauseFieldGuide
            seenTopics={settings.seenFieldGuideTopics}
            onMarkSeen={(topic) => onMarkFieldGuideTopicSeen?.(topic)}
            onBack={onBack}
          />
        ) : (
          <PauseOptions
            settings={settings}
            onToggleSound={onToggleSound}
            onToggleMusic={onToggleMusic}
            onToggleVoice={onToggleVoice}
            onToggleReducedMotion={onToggleReducedMotion}
            onToggleHighContrast={onToggleHighContrast}
            onCycleColorblind={onCycleColorblind}
            onCycleHudScale={onCycleHudScale}
            onUpdateKeyBindings={onUpdateKeyBindings}
            onVolumeChange={onVolumeChange}
            onDiagnostics={onDiagnostics}
            onBack={onBack}
          />
        )}
        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
        {view === "main" && onLeaveWithoutSave ? (
          <ConsoleButton className={styles.action} onClick={onLeaveWithoutSave}>
            Leave without saving
          </ConsoleButton>
        ) : null}
        <p className={styles.hint}>
          {view === "main" ? "Escape resumes the mission" : view === "diagnostics" ? "Escape returns to game options" : "Escape returns to the pause menu"}
        </p>
      </MetalPanel>
    </div>
  );
}

import { PauseMenu } from "./PauseMenu";
import type { PauseSurfaceModel } from "./hooks/runtime/types";

export function GamePauseSurface({ view, notice, settings, tutorial, setView, setNotice, onControlsOpened, session }: PauseSurfaceModel) {
  return (
    <PauseMenu
      view={view}
      notice={notice}
      settings={settings}
      tutorial={tutorial}
      saveSlots={session.saveSlots}
      loadEntries={session.loadEntries}
      defaultSlotName={session.defaultSlotName}
      onResume={session.onResume}
      onSave={session.onSave}
      onLoad={session.onLoad}
      onCommitSave={session.onCommitSave}
      onLoadEntry={session.onLoadEntry}
      onDeleteEntry={session.onDeleteEntry}
      onBriefing={session.onBriefing}
      onRestart={session.onRestart}
      onControls={() => {
        onControlsOpened?.();
        setView("controls");
        setNotice("");
      }}
      onDiagnostics={session.telemetryEnabled ? () => { setView("diagnostics"); setNotice(""); } : undefined}
      onBackToOptions={() => { setView("options"); setNotice(""); }}
      onOptions={() => { setView("options"); setNotice(""); }}
      onMenu={session.onMenu}
      onLeaveWithoutSave={session.onLeaveWithoutSave}
      onToggleSound={session.onToggleSound}
      onToggleMusic={session.onToggleMusic}
      onToggleReducedMotion={session.onToggleReducedMotion}
      onToggleHighContrast={session.onToggleHighContrast}
      onCycleColorblind={session.onCycleColorblind}
      onCycleHudScale={session.onCycleHudScale}
      onUpdateKeyBindings={session.onUpdateKeyBindings}
      onVolumeChange={session.onVolumeChange}
      telemetryRecordCount={session.telemetryEnabled ? session.telemetryRecordCount : undefined}
      onExportTelemetry={session.telemetryEnabled ? session.onExportTelemetry : undefined}
      onClearTelemetry={session.telemetryEnabled ? session.onClearTelemetry : undefined}
      onBack={() => setView("main")}
    />
  );
}

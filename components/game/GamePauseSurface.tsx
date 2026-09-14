import type { GameSettings } from "@/lib/persist/settings";
import type { PauseView } from "@/lib/ui/shortcuts";
import { PauseMenu } from "./PauseMenu";
import type { GameSession } from "./hooks/useGameSession";

export function GamePauseSurface({
  view,
  notice,
  settings,
  tutorial,
  setView,
  setNotice,
  onControlsOpened,
  session,
}: {
  view: PauseView;
  notice: string;
  settings: GameSettings;
  tutorial: boolean;
  setView: (view: PauseView) => void;
  setNotice: (notice: string) => void;
  onControlsOpened?: () => void;
  session: GameSession;
}) {
  return (
    <PauseMenu
      view={view}
      notice={notice}
      settings={settings}
      tutorial={tutorial}
      saveSlots={session.listSaveSlots()}
      loadEntries={session.listLoadEntries()}
      defaultSlotName={session.defaultSlotName()}
      onResume={session.resumeMission}
      onSave={session.saveMission}
      onLoad={session.loadMission}
      onCommitSave={session.saveNamedSlot}
      onLoadEntry={session.loadArchiveEntry}
      onDeleteEntry={session.deleteArchiveEntry}
      onBriefing={session.viewMissionBriefing}
      onRestart={session.restartMission}
      onControls={() => {
        onControlsOpened?.();
        setView("controls");
        setNotice("");
      }}
      onOptions={() => {
        setView("options");
        setNotice("");
      }}
      onMenu={session.goMenu}
      onLeaveWithoutSave={session.canLeaveWithoutSave ? session.leaveWithoutSave : undefined}
      onToggleSound={session.toggleSound}
      onToggleMusic={session.toggleMusic}
      onToggleReducedMotion={session.toggleReducedMotion}
      onToggleHighContrast={session.toggleHighContrast}
      onCycleColorblind={session.cycleColorblind}
      onUpdateKeyBindings={session.updateKeyBindings}
      onVolumeChange={session.updateVolume}
      telemetryRecordCount={session.telemetryEnabled ? session.telemetryRecordCount : undefined}
      onExportTelemetry={session.telemetryEnabled ? session.exportTelemetry : undefined}
      onClearTelemetry={session.telemetryEnabled ? session.clearTelemetry : undefined}
      onBack={() => setView("main")}
    />
  );
}

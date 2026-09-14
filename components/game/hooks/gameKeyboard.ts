import type { MutableRefObject } from "react";
import { beep } from "@/lib/audio/synth";
import type { BuildingKind, ControlGroupSlot, SimState } from "@/lib/types";
import type { CommandTab, GameCommand, PauseView } from "@/lib/ui/shortcuts";

export type GameCommandHandlers = {
  activeTab: CommandTab;
  openPauseMenu: (view?: PauseView) => void;
  resumeMission: () => void;
  setPauseView: (view: PauseView) => void;
  setPauseNotice: (notice: string) => void;
  setActiveTab: (tab: CommandTab) => void;
  activateCameo: (tab: "construction" | "production", index: number, cancel: boolean) => void;
  assignControlGroup: (slot: ControlGroupSlot) => void;
  recallControlGroup: (slot: ControlGroupSlot) => void;
  jumpHome: () => void;
  centerSelection: () => void;
  toggleRepair: () => void;
  toggleSell: () => void;
  stopSelected: () => void;
  clearTools: () => void;
  saveMission: () => void;
  loadMission: () => void;
  viewMissionBriefing: () => void;
  restartMission: () => void;
  toggleSound: () => void;
  toggleMusic: () => void;
  resultPrimary: () => void;
  onNavigateHome: () => void;
};

export type GameKeyboardParams = Omit<GameCommandHandlers, "activeTab"> & {
  stateRef: MutableRefObject<SimState>;
  pausedRef: MutableRefObject<boolean>;
  pauseViewRef: MutableRefObject<PauseView>;
  activeTabRef: MutableRefObject<CommandTab>;
  place: MutableRefObject<BuildingKind | null>;
  repair: MutableRefObject<boolean>;
  sell: MutableRefObject<boolean>;
  confirmationOpen?: boolean;
  cancelConfirmation?: () => void;
  mobilePanelOpen?: boolean;
  closeMobilePanel?: () => void;
  mobileToolActive?: boolean;
  keyBindings?: import("@/lib/persist/settings").KeyBindings;
};

export function applyGameCommand(command: GameCommand, handlers: GameCommandHandlers): void {
  if (command.type === "pause") handlers.openPauseMenu();
  else if (command.type === "resume") handlers.resumeMission();
  else if (command.type === "pauseBack") handlers.setPauseView("main");
  else if (command.type === "tab") handlers.setActiveTab(command.tab);
  else if (command.type === "assignGroup") handlers.assignControlGroup(command.slot);
  else if (command.type === "recallGroup") handlers.recallControlGroup(command.slot);
  else if (command.type === "cameo" && handlers.activeTab !== "selected") {
    handlers.activateCameo(handlers.activeTab, command.index, command.cancel);
  } else if (command.type === "home") handlers.jumpHome();
  else if (command.type === "center") handlers.centerSelection();
  else if (command.type === "repair") handlers.toggleRepair();
  else if (command.type === "sell") handlers.toggleSell();
  else if (command.type === "stop") handlers.stopSelected();
  else if (command.type === "cancelTool") {
    handlers.clearTools();
    beep("cancel");
  } else if (command.type === "save") handlers.saveMission();
  else if (command.type === "load") handlers.loadMission();
  else if (command.type === "briefing") handlers.viewMissionBriefing();
  else if (command.type === "restart") handlers.restartMission();
  else if (command.type === "options") {
    handlers.setPauseView("options");
    handlers.setPauseNotice("");
  } else if (command.type === "controls") {
    handlers.openPauseMenu("controls");
  } else if (command.type === "menu") handlers.onNavigateHome();
  else if (command.type === "toggleSound") handlers.toggleSound();
  else if (command.type === "toggleMusic") handlers.toggleMusic();
  else if (command.type === "resultPrimary") handlers.resultPrimary();
  else if (command.type === "resultMenu") handlers.onNavigateHome();
}

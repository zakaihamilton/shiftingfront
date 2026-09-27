import type { SimState } from "@/lib/types";

export type MissionConfirmationAction = "restart" | "menu";

export type MissionConfirmation = {
  action: MissionConfirmationAction;
  title: string;
  message: string;
  confirmLabel: string;
};

export function missionConfirmationFor(
  action: MissionConfirmationAction,
  result: SimState["result"] = "playing",
  multiplayer = false,
): MissionConfirmation {
  const terminal = result !== "playing";
  if (action === "menu") {
    return {
      action,
      title: multiplayer ? "Leave skirmish?" : "Leave mission?",
      message: terminal
        ? "Return to the main menu?"
        : multiplayer
        ? "Return to the main menu? You will forfeit your position in this skirmish."
        : "Return to the main menu? Unsaved mission progress will be lost.",
      confirmLabel: multiplayer ? "Leave skirmish" : "Leave mission",
    };
  }
  return {
    action,
    title: "Restart mission?",
    message: terminal
      ? "Restart this mission from the beginning?"
      : "Restart this mission from the beginning? Unsaved mission progress will be lost.",
    confirmLabel: "Restart mission",
  };
}

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
): MissionConfirmation {
  const terminal = result !== "playing";
  if (action === "menu") {
    return {
      action,
      title: "Leave mission?",
      message: terminal
        ? "Return to the main menu?"
        : "Return to the main menu? Unsaved mission progress will be lost.",
      confirmLabel: "Leave mission",
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

import { useCallback, useState } from "react";
import type { SimState } from "@/lib/types";
import {
  missionConfirmationFor,
  type MissionConfirmation,
  type MissionConfirmationAction,
} from "./missionConfirmation";

export function useMissionConfirmation({
  restartNow,
  goHomeNow,
  getResult,
}: {
  restartNow: () => void;
  goHomeNow: () => void;
  getResult?: () => SimState["result"];
}) {
  const [confirmation, setConfirmation] = useState<MissionConfirmation | null>(null);

  const requestConfirmation = useCallback((action: MissionConfirmationAction) => {
    setConfirmation(missionConfirmationFor(action, getResult?.() ?? "playing"));
  }, [getResult]);

  const restartMission = useCallback(() => {
    requestConfirmation("restart");
  }, [requestConfirmation]);

  const goHome = useCallback(() => {
    requestConfirmation("menu");
  }, [requestConfirmation]);

  const confirmAction = useCallback(() => {
    const action = confirmation?.action;
    setConfirmation(null);
    if (action === "restart") restartNow();
    else if (action === "menu") goHomeNow();
  }, [confirmation, goHomeNow, restartNow]);

  const cancelConfirmation = useCallback(() => {
    setConfirmation(null);
  }, []);

  return {
    confirmation,
    confirmAction,
    cancelConfirmation,
    restartMission,
    goHome,
  };
}

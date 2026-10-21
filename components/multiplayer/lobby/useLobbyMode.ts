import { useCallback, useEffect, useState, type RefObject } from "react";
import type { MultiplayerSession } from "@/lib/multiplayer/session";
import type { LobbyMode } from "./types";

export type LobbyEscapeHandlers = {
  mode: LobbyMode;
  session: MultiplayerSession | null;
  backToMenu: () => void;
  backToChoose: () => void;
  cancelJoin: () => void;
  endCurrentMatch: () => void;
};

export function useLobbyMode(escapeRef: RefObject<LobbyEscapeHandlers>) {
  const [mode, setMode] = useState<LobbyMode>("choose");
  const [error, setError] = useState("");

  const showHostSetup = useCallback(() => {
    setMode("hostSetup");
    setError("");
  }, []);

  const backToChoose = useCallback(() => {
    setMode("choose");
    setError("");
  }, []);

  const enterBattle = useCallback(() => {
    setError("");
    setMode("battle");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.repeat ||
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const current = escapeRef.current;
      if (current.mode === "battle" && current.session &&
          current.session.status !== "disconnected" && current.session.status !== "ended") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (current.mode === "choose") current.backToMenu();
      else if (current.mode === "hostSetup") current.backToChoose();
      else if (current.mode === "joining") current.cancelJoin();
      else current.endCurrentMatch();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [escapeRef]);

  return { mode, setMode, error, setError, showHostSetup, backToChoose, enterBattle };
}

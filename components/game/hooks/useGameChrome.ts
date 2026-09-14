import { useCallback, useEffect, useRef, useState } from "react";
import { cachedLocalStorage } from "@/lib/persist/save";
import { readSettings } from "@/lib/persist/settings";
import type { Command, SimState } from "@/lib/types";
import type { CommandTab, PauseView } from "@/lib/ui/shortcuts";

export type CommandNoticeKind = "success" | "info" | "warning" | "error";
export type CommandNoticeState = { text: string; kind: CommandNoticeKind } | null;

export function useGameChrome(initialResult: SimState["result"] = "playing") {
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CommandTab>("construction");
  const activeTabRef = useRef(activeTab);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const terminalSaveRef = useRef(initialResult !== "playing");
  const campaignRecordedRef = useRef(initialResult === "won");
  const [pauseView, setPauseView] = useState<PauseView>("main");
  const pauseViewRef = useRef(pauseView);
  const [pauseNotice, setPauseNotice] = useState("");
  const [commandNotice, setCommandNotice] = useState<CommandNoticeState>(null);
  const commandNoticeTimer = useRef<number | null>(null);
  const [audioSettings, setAudioSettings] = useState(() => readSettings(cachedLocalStorage()));
  const cmdQ = useRef<Command[]>([]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    pauseViewRef.current = pauseView;
  }, [pauseView]);

  useEffect(() => () => {
    if (commandNoticeTimer.current !== null) window.clearTimeout(commandNoticeTimer.current);
  }, []);

  const announceCommand = useCallback((text: string, kind: CommandNoticeKind = "info") => {
    setCommandNotice({ text, kind });
    if (commandNoticeTimer.current !== null) window.clearTimeout(commandNoticeTimer.current);
    commandNoticeTimer.current = window.setTimeout(() => {
      setCommandNotice(null);
      commandNoticeTimer.current = null;
    }, kind === "error" || kind === "warning" ? 3600 : 2200);
  }, []);

  return {
    mobilePanelOpen,
    setMobilePanelOpen,
    activeTab,
    setActiveTab,
    activeTabRef,
    paused,
    setPaused,
    pausedRef,
    terminalSaveRef,
    campaignRecordedRef,
    pauseView,
    setPauseView,
    pauseViewRef,
    pauseNotice,
    setPauseNotice,
    commandNotice,
    announceCommand,
    audioSettings,
    setAudioSettings,
    cmdQ,
  };
}

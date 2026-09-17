"use client";

import { useCallback, useEffect, useRef } from "react";
import { canonicalCommandRejectionReason, createMissionUxTelemetry, type MissionUxTelemetry } from "@/lib/persist/telemetry";
import { consumeBriefingSkippedIntent } from "@/lib/persist/navigation";
import { useCombatAlert } from "./useCombatAlert";
import type { CommandNoticeKind, CommandNoticeState } from "./useGameChrome";

export function useGameRuntimeFeedback({ seed, mission, tutorial, showCommandNotice }: { seed: number; mission: number; tutorial: boolean; showCommandNotice: (text: string, kind?: CommandNoticeKind) => void }) {
  const uxRef = useRef<MissionUxTelemetry>(createMissionUxTelemetry());

  const recordCommandRejection = useCallback((text: string) => {
    const reason = canonicalCommandRejectionReason(text);
    uxRef.current.commandRejectionsByReason[reason] = (uxRef.current.commandRejectionsByReason[reason] ?? 0) + 1;
  }, []);

  const announceCommandFeedback = useCallback((text: string, kind: CommandNoticeKind = "info") => {
    uxRef.current.commandFeedbackCount += 1;
    showCommandNotice(text, kind);
  }, [showCommandNotice]);

  const onObjectivePanelToggle = useCallback(() => {
    uxRef.current.objectivePanelToggles += 1;
  }, []);

  const recordControlsOpened = useCallback(() => {
    uxRef.current.controlsOpened += 1;
  }, []);

  const recordMobilePanelOpened = useCallback(() => {
    uxRef.current.mobilePanelOpened += 1;
  }, []);

  const recordTutorialResult = useCallback((completed: boolean) => {
    if (completed) uxRef.current.tutorialCompleted = true;
    else uxRef.current.tutorialExited = true;
  }, []);

  useEffect(() => {
    if (!tutorial && consumeBriefingSkippedIntent(seed, mission)) uxRef.current.briefingSkipped = true;
  }, [mission, seed, tutorial]);

  const combat = useCombatAlert();
  return {
    uxRef,
    recordCommandRejection,
    announceCommandFeedback,
    onObjectivePanelToggle,
    recordControlsOpened,
    recordMobilePanelOpened,
    recordTutorialResult,
    ...combat,
  };
}

export type GameRuntimeFeedback = ReturnType<typeof useGameRuntimeFeedback>;
export type RuntimeFeedbackNotice = CommandNoticeState;

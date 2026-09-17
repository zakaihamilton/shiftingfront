import { useCallback, type MutableRefObject } from "react";
import { beep } from "@/lib/audio/synth";
import { beepForCommands } from "@/lib/audio/uiOrders";
import { voiceBarkForBeep } from "@/lib/audio/voice";
import { COMMAND_MARKER_INVALID_MS, commandMarkerKind, type CommandMarker } from "@/lib/render/renderOverlays";
import type { Camera } from "@/lib/iso";
import type { Command, SimState } from "@/lib/types";
import type { MobileCommand } from "../mobileCommandTypes";
import { contextOrders, contextOrderNotice, pickSelectableEntity, pointerTile } from "./gameInputOrders";
import { createRuntimeCommandPort, type RuntimeCommandPort } from "./runtime/facade";
import type { CommandNoticeKind } from "./useGameChrome";
import type { MissionUxTelemetry } from "@/lib/persist/telemetry";

export function useOrderDispatch({
  camRef,
  selectedRef,
  commandPort,
  cmdQRef,
  repairRef,
  sellRef,
  clearTools,
  mobileCommandRef,
  setMobileCommandState,
  commandMarkerRef,
  syncCursor,
  onCommandNotice,
  onCommandRejection,
  uxRef,
}: {
  camRef: MutableRefObject<Camera>;
  selectedRef: MutableRefObject<Set<number>>;
  commandPort?: RuntimeCommandPort;
  /** Compatibility input for isolated hook consumers. */
  cmdQRef?: MutableRefObject<Command[]>;
  repairRef: MutableRefObject<boolean>;
  sellRef: MutableRefObject<boolean>;
  clearTools: () => void;
  mobileCommandRef: MutableRefObject<MobileCommand | null>;
  setMobileCommandState: (v: MobileCommand | null) => void;
  commandMarkerRef: MutableRefObject<CommandMarker | null>;
  syncCursor: () => void;
  onCommandNotice?: (text: string, kind?: CommandNoticeKind) => void;
  onCommandRejection?: (reason: string) => void;
  uxRef?: MutableRefObject<MissionUxTelemetry>;
}) {
  const resolvedCommandPort = commandPort ?? (cmdQRef ? createRuntimeCommandPort(cmdQRef) : undefined);
  if (!resolvedCommandPort) throw new Error("useOrderDispatch requires a runtime command port");
  const markUnitCommand = useCallback((s: SimState, p: { x: number; y: number }, commands: Command[]) => {
    const kind = commandMarkerKind(commands);
    if (!kind) {
      commandMarkerRef.current = null;
      return;
    }
    const { x, y } = pointerTile(s, p, camRef.current);
    commandMarkerRef.current = {
      x,
      y,
      bornMs: performance.now(),
      kind,
      mode: commands.some((command) => command.type === "attackMove") ? "attackMove" : "attack",
      unitIds: [...new Set(commands.flatMap((command) => ("unitIds" in command ? command.unitIds : [])))],
      targetId: commands.find((command) => command.type === "attack")?.targetId,
    };
  }, [camRef, commandMarkerRef]);
  const markInvalidCommand = useCallback((s: SimState, p: { x: number; y: number }) => {
    const { x, y } = pointerTile(s, p, camRef.current);
    const bornMs = performance.now();
    commandMarkerRef.current = { x, y, bornMs, expiresMs: bornMs + COMMAND_MARKER_INVALID_MS, kind: "invalid" };
  }, [camRef, commandMarkerRef]);

  const issueContextOrder = useCallback((s: SimState, p: { x: number; y: number }, attackMove = false) => {
    const { x: tx, y: ty } = pointerTile(s, p, camRef.current);
    if (repairRef.current || sellRef.current) {
      clearTools();
      beep("cancel");
      syncCursor();
      return;
    }
    const ids = [...selectedRef.current];
    const target = pickSelectableEntity(s, p.x, p.y, tx, ty, camRef.current);
    const commands = contextOrders(s, ids, target, tx, ty, attackMove);
    if (!commands.length) {
      markInvalidCommand(s, p);
      onCommandRejection?.(target ? "That target cannot receive this order." : "No eligible units for that order.");
      onCommandNotice?.(target ? "That target cannot receive this order." : "No eligible units for that order.", "error");
    }
    resolvedCommandPort.enqueueMany(commands);
    markUnitCommand(s, p, commands);
    if (commands.length && uxRef && uxRef.current.firstOrderTick === undefined) uxRef.current.firstOrderTick = s.tick;
    mobileCommandRef.current = null;
    setMobileCommandState(null);
    const kind = beepForCommands(commands);
    if (kind) {
      beep(kind);
      if (commands.some((command) => "unitIds" in command && command.unitIds.length > 0)) {
        voiceBarkForBeep(kind);
      }
    }
    if (commands.length) {
      onCommandNotice?.(contextOrderNotice(commands), "success");
    }
  }, [camRef, clearTools, markInvalidCommand, markUnitCommand, mobileCommandRef, onCommandNotice, onCommandRejection, repairRef, resolvedCommandPort, selectedRef, sellRef, setMobileCommandState, syncCursor, uxRef]);

  return { markUnitCommand, markInvalidCommand, issueContextOrder };
}

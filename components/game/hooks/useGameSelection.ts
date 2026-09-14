import { useCallback, useRef, useState, type MutableRefObject } from "react";
import { isPlayerSelectableEntity, isPlayerSelectableUnit, type ControlGroupSlot, type SimState } from "@/lib/types";
import type { MissionUxTelemetry } from "@/lib/persist/telemetry";

export function useGameSelection({
  stateRef,
  setState,
  uxRef,
}: {
  stateRef: MutableRefObject<SimState>;
  setState: (state: SimState) => void;
  uxRef?: MutableRefObject<MissionUxTelemetry>;
}) {
  const selected = useRef(new Set<number>());
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const selectionModeRef = useRef(false);

  const commitSelection = useCallback((ids: number[]) => {
    const selectableIds = ids.filter((id) => {
      const entity = stateRef.current.entities.find((candidate) => candidate.id === id);
      return Boolean(entity && entity.owner === 0 && isPlayerSelectableEntity(entity) && entity.hp > 0);
    });
    selected.current = new Set(selectableIds);
    setSelectedIds(selectableIds);
    if (selectableIds.length > 0 && uxRef && uxRef.current.firstSelectionTick === undefined) {
      uxRef.current.firstSelectionTick = stateRef.current.tick;
    }
    const current = stateRef.current;
    if (current.tutorialStage === "select" && selectableIds.some((id) => {
      const entity = current.entities.find((item) => item.id === id);
      return entity?.owner === 0 && entity.class === "unit" && entity.kind === "infantry" && !entity.neutral;
    })) {
      current.tutorialStage = "move";
      setState({ ...current, entities: [...current.entities] });
    }
  }, [setState, stateRef, uxRef]);

  const assignControlGroup = useCallback((slot: ControlGroupSlot): number => {
    const state = stateRef.current;
    const ids = [...selected.current].filter((id) => {
      const entity = state.entities.find((candidate) => candidate.id === id);
      return Boolean(entity && entity.hp > 0 && entity.owner === 0 && isPlayerSelectableUnit(entity) && !entity.neutral);
    });
    const controlGroups = { ...(state.controlGroups ?? {}), [slot]: ids };
    state.controlGroups = controlGroups;
    setState({ ...state, controlGroups });
    return ids.length;
  }, [setState, stateRef]);

  const recallControlGroup = useCallback((slot: ControlGroupSlot): number => {
    const state = stateRef.current;
    const existing = state.controlGroups?.[slot] ?? [];
    const ids = [...new Set(existing)].filter((id) => {
      const entity = state.entities.find((candidate) => candidate.id === id);
      return Boolean(entity && entity.hp > 0 && entity.owner === 0 && isPlayerSelectableUnit(entity) && !entity.neutral);
    });
    const controlGroups = { ...(state.controlGroups ?? {}), [slot]: ids };
    state.controlGroups = controlGroups;
    setState({ ...state, controlGroups });
    commitSelection(ids);
    return ids.length;
  }, [commitSelection, setState, stateRef]);

  const setSelectionModeState = useCallback((active: boolean) => {
    selectionModeRef.current = active;
    setSelectionMode(active);
  }, []);

  return {
    selected,
    selectedIds,
    selectionMode,
    selectionModeRef,
    commitSelection,
    assignControlGroup,
    recallControlGroup,
    setSelectionMode: setSelectionModeState,
  };
}

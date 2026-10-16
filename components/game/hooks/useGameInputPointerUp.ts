import { useCallback, useRef, type MutableRefObject, type PointerEvent } from "react";
import type { Camera } from "@/lib/iso";
import type { BuildingEntity, BuildingKind, SharedProducerKind, SimState } from "@/lib/types";
import type { MobileCommand } from "../mobileCommandTypes";
import { canvasPointerPos } from "./canvasPointer";
import { pickSelectableEntity, pointerTile } from "./gameInputOrders";
import { isSameKindDoubleClick, isSameProducerDoubleClick, resolvePointerUp, type LastProducerClick, type LastUnitClick } from "./gamePointerUp";
import { selectionBoxDistance, type SelectionBox } from "./selectionBox";
import type { RuntimeCommandPort } from "./runtime/facade";
import { activeProducerFor, isSharedProducerKind } from "@/lib/sim/producerState";

type PointerPosition = { x: number; y: number };
type PointerUpEffect = ReturnType<typeof resolvePointerUp>;

/** Resolve a canvas release into selection, contextual orders, or producer activation. */
export function useGameInputPointerUp(options: {
  stateRef: MutableRefObject<SimState>;
  camRef: MutableRefObject<Camera>;
  selectedRef: MutableRefObject<Set<number>>;
  boxRef: MutableRefObject<SelectionBox | null>;
  selectionModeRef: MutableRefObject<boolean>;
  mobileCommandRef: MutableRefObject<MobileCommand | null>;
  placeRef: MutableRefObject<BuildingKind | null>;
  repairRef: MutableRefObject<boolean>;
  sellRef: MutableRefObject<boolean>;
  commandPort: RuntimeCommandPort;
  applyEdgePan: (direction: import("@/lib/render/camera").PanDir | null) => void;
  endTouch: (event: PointerEvent<HTMLCanvasElement>, point: PointerPosition) => boolean;
  issueContextOrder: (state: SimState, point: PointerPosition, attackMove: boolean | undefined) => void;
  applyPointerUp: (effect: PointerUpEffect, event: PointerEvent<HTMLCanvasElement>) => void;
}) {
  const {
    stateRef, camRef, selectedRef, boxRef, selectionModeRef, mobileCommandRef,
    placeRef, repairRef, sellRef, commandPort, applyEdgePan, endTouch,
    issueContextOrder, applyPointerUp,
  } = options;
  const lastUnitClickRef = useRef<LastUnitClick | null>(null);
  const lastProducerClickRef = useRef<LastProducerClick | null>(null);

  const onPointerUp = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    applyEdgePan(null);
    if (event.pointerType !== "touch") {
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Synthetic pointer events used by accessibility and browser tests may not support capture.
      }
    }
    const point = canvasPointerPos(event);
    const state = stateRef.current;
    if (!state) return;
    if (event.pointerType === "touch" && endTouch(event, point)) return;
    const camera = camRef.current;
    const drag = Boolean(boxRef.current && selectionBoxDistance(boxRef.current, camera) > 8);
    const nowMs = performance.now();
    const { x: tileX, y: tileY } = pointerTile(state, point, camera);
    const hoverHit = !drag && (event.button === 0 || event.pointerType === "touch")
      ? pickSelectableEntity(state, point.x, point.y, tileX, tileY, camera)
      : undefined;
    const doubleClick = Boolean(
      hoverHit &&
        hoverHit.class === "unit" &&
        isSameKindDoubleClick(lastUnitClickRef.current, {
          atMs: nowMs,
          kind: hoverHit.kind,
          x: point.x,
          y: point.y,
        }),
    );
    const owner = state.viewOwner ?? 0;
    const producerHit = hoverHit?.class === "building" &&
      isSharedProducerKind(hoverHit.kind) &&
      hoverHit.owner === owner &&
      hoverHit.constructing <= 0 &&
      !placeRef.current && !repairRef.current && !sellRef.current && !mobileCommandRef.current &&
      (event.button === 0 || event.pointerType === "touch")
      ? hoverHit as BuildingEntity & { kind: SharedProducerKind }
      : undefined;
    const activatesProducer = Boolean(
      producerHit &&
      isSameProducerDoubleClick(lastProducerClickRef.current, {
        atMs: nowMs,
        buildingId: producerHit.id,
        x: point.x,
        y: point.y,
      }) &&
      activeProducerFor(state, owner, producerHit.kind)?.id !== producerHit.id,
    );
    const effect = resolvePointerUp({
      pointerType: event.pointerType,
      button: event.button,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      p: point,
      state,
      cam: camera,
      selectedIds: [...selectedRef.current],
      box: boxRef.current,
      selectionMode: selectionModeRef.current,
      mobileCommand: mobileCommandRef.current,
      placeKind: placeRef.current,
      repairMode: repairRef.current,
      sellMode: sellRef.current,
      doubleClick,
      viewport: { width: event.currentTarget.width, height: event.currentTarget.height },
    });
    const rememberUnitClick = () => {
      if (!drag && hoverHit?.class === "unit" && effect.select?.includes(hoverHit.id)) {
        lastUnitClickRef.current = { atMs: nowMs, kind: hoverHit.kind, x: point.x, y: point.y };
      } else {
        lastUnitClickRef.current = null;
      }
    };
    if (effect.contextOrder) {
      lastUnitClickRef.current = null;
      lastProducerClickRef.current = null;
      if (effect.preventDefault) event.preventDefault();
      issueContextOrder(state, point, effect.attackMove);
      return;
    }
    applyPointerUp(effect, event);
    if (activatesProducer && producerHit && !effect.commands?.length) {
      commandPort.enqueue({ type: "activateProducer", buildingId: producerHit.id });
      lastProducerClickRef.current = null;
    } else if (producerHit && !effect.commands?.length && effect.select?.includes(producerHit.id)) {
      lastProducerClickRef.current = { atMs: nowMs, buildingId: producerHit.id, x: point.x, y: point.y };
    } else {
      lastProducerClickRef.current = null;
    }
    rememberUnitClick();
  }, [applyEdgePan, applyPointerUp, boxRef, camRef, commandPort, endTouch, issueContextOrder,
    mobileCommandRef, placeRef, repairRef, selectedRef, selectionModeRef, sellRef, stateRef]);

  const resetUnitClick = useCallback(() => {
    lastUnitClickRef.current = null;
  }, []);

  return { onPointerUp, resetUnitClick };
}

// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { useRef, type PointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { createCamera, TILE_H, tileToScreen } from "../../lib/iso";
import { addUnit, makeFixture } from "../../lib/sim/fixtures";
import { heightAt } from "../../lib/sim/world";
import type { BuildingKind, Command, SimState } from "../../lib/types";
import { useGameInput } from "../../components/game/hooks/useGameInput";
import { useTouchGestures } from "../../components/game/hooks/useTouchGestures";
import { voiceBarkForBeep } from "../../lib/audio/voice";

vi.mock("@/lib/audio/synth", () => ({ beep: vi.fn() }));
vi.mock("@/lib/audio/voice", () => ({ voiceBarkForBeep: vi.fn() }));

function testCanvas() {
  const canvas = {
    width: 800,
    height: 600,
    style: { cursor: "" },
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 600 }) as DOMRect,
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  } as unknown as HTMLCanvasElement;
  return canvas;
}

function pointerEvent(canvas: HTMLCanvasElement, overrides: Partial<PointerEvent<HTMLCanvasElement>> = {}) {
  return {
    currentTarget: canvas,
    pointerId: 7,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: 120,
    clientY: 140,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as PointerEvent<HTMLCanvasElement>;
}

function renderInput(
  canvas: HTMLCanvasElement,
  overrides: {
    repairMode?: boolean;
    repairRef?: { current: boolean };
    placeKind?: BuildingKind;
    selected?: Set<number>;
    setup?: (state: SimState) => void;
  } = {},
) {
  const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
  overrides.setup?.(state);
  const commitSelection = vi.fn();
  const applyEdgePan = vi.fn();
  const clearTools = vi.fn();
  const repairRef = overrides.repairRef ?? { current: overrides.repairMode ?? false };
  const { result, rerender } = renderHook(
    (props: { repairMode: boolean }) => useGameInput({
      stateRef: useRef(state),
      camRef: useRef(createCamera()),
      selectedRef: useRef(overrides.selected ?? new Set<number>()),
      commitSelection,
      cmdQRef: useRef<Command[]>([]),
      placeRef: useRef<BuildingKind | null>(overrides.placeKind ?? null),
      setPlaceKind: vi.fn(),
      repairRef,
      repairMode: props.repairMode,
      setRepairMode: vi.fn(),
      sellRef: useRef(false),
      setSellMode: vi.fn(),
      clearTools,
      mobileCommandRef: useRef(null),
      setMobileCommandState: vi.fn(),
      pausedRef: useRef(false),
      panAvailRef: useRef({ left: true, right: true, up: true, down: true }),
      applyEdgePan,
      selectionModeRef: useRef(false),
      setSelectionMode: vi.fn(),
    }),
    { initialProps: { repairMode: overrides.repairMode ?? false } },
  );
  return { result, canvas, commitSelection, applyEdgePan, clearTools, repairRef, rerender, state };
}

describe("desktop marquee pointer lifecycle", () => {
  it("captures the pointer, preserves the box on leave, and releases on pointer-up", () => {
    const canvas = testCanvas();
    const { result, commitSelection, applyEdgePan } = renderInput(canvas);

    act(() => {
      result.current.onDown(pointerEvent(canvas));
      result.current.onLeave();
      result.current.onUp(pointerEvent(canvas, { clientX: 700, clientY: 500, buttons: 0 }));
    });

    expect(canvas.setPointerCapture).toHaveBeenCalledWith(7);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(result.current.boxRef.current).toBeNull();
    expect(commitSelection).toHaveBeenCalledOnce();
    expect(applyEdgePan).toHaveBeenLastCalledWith(null);
  });

  it("releases capture and clears the marquee on pointer-cancel", () => {
    const canvas = testCanvas();
    const { result, applyEdgePan, clearTools } = renderInput(canvas);

    act(() => {
      result.current.onDown(pointerEvent(canvas));
      result.current.onCancel(pointerEvent(canvas));
    });

    expect(canvas.setPointerCapture).toHaveBeenCalledWith(7);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(result.current.boxRef.current).toBeNull();
    expect(applyEdgePan).toHaveBeenLastCalledWith(null);
    expect(clearTools).toHaveBeenCalledOnce();
  });

  it("keeps a click-sized marquee when pointerenter fires with captured-button coordinates", () => {
    const canvas = testCanvas();
    const { result } = renderInput(canvas);

    act(() => {
      result.current.onDown(pointerEvent(canvas, { clientX: 120, clientY: 140 }));
    });
    expect(result.current.boxRef.current).toMatchObject({ x0: 110, y0: 120, x1: 110, y1: 120 });

    act(() => {
      result.current.onEnter(pointerEvent(canvas, {
        type: "pointerenter",
        clientX: 10,
        clientY: 20,
        buttons: 1,
      }));
      result.current.onMove(pointerEvent(canvas, {
        type: "pointerenter",
        clientX: 10,
        clientY: 20,
        buttons: 1,
      }));
    });

    expect(result.current.boxRef.current).toMatchObject({ x0: 110, y0: 120, x1: 110, y1: 120 });
    expect(canvas.style.cursor).toBe("crosshair");
  });
});

describe("battlefield cursor", () => {
  it("updates the canvas cursor when repair mode turns on without another pointer move", () => {
    const canvas = testCanvas();
    const repairRef = { current: false };
    const { result, rerender } = renderInput(canvas, { repairRef });

    act(() => {
      result.current.onMove(pointerEvent(canvas, { buttons: 0 }));
    });
    expect(canvas.style.cursor).toBe("crosshair");

    repairRef.current = true;
    rerender({ repairMode: true });
    expect(canvas.style.cursor).toBe("not-allowed");
  });
});

describe("touch gesture lifecycle", () => {
  it("distinguishes a tap from a drag and fires long press once", () => {
    vi.useFakeTimers();
    try {
      const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
      const cam = createCamera();
      const selectionModeRef = { current: false };
      const boxRef = { current: null };
      const issueContextOrder = vi.fn();
      const { result } = renderHook(() => useTouchGestures({
        camRef: { current: cam },
        stateRef: { current: state },
        selectionModeRef,
        boxRef,
        issueContextOrder,
      }));
      const canvas = testCanvas();
      const touch = (overrides: Partial<PointerEvent<HTMLCanvasElement>> = {}) => pointerEvent(canvas, { pointerType: "touch", ...overrides });

      act(() => result.current.beginTouch(touch(), { x: 100, y: 100 }));
      expect(result.current.endTouch(touch({ buttons: 0 }))).toBe(false);

      act(() => result.current.beginTouch(touch(), { x: 100, y: 100 }));
      act(() => result.current.moveTouch(touch({ clientX: 130, clientY: 100 }), { x: 130, y: 100 }));
      expect(result.current.endTouch(touch({ clientX: 130, clientY: 100, buttons: 0 }))).toBe(true);
      expect(issueContextOrder).not.toHaveBeenCalled();

      act(() => result.current.beginTouch(touch(), { x: 100, y: 100 }));
      act(() => vi.advanceTimersByTime(500));
      expect(issueContextOrder).toHaveBeenCalledOnce();
      expect(result.current.endTouch(touch({ buttons: 0 }))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not treat a captured pointerenter as a touch pan that swallows the tap", () => {
    const canvas = testCanvas();
    const { result, commitSelection } = renderInput(canvas);

    act(() => {
      result.current.onDown(pointerEvent(canvas, { pointerType: "touch", clientX: 120, clientY: 140 }));
      result.current.onEnter(pointerEvent(canvas, {
        pointerType: "touch",
        type: "pointerenter",
        clientX: 10,
        clientY: 20,
        buttons: 1,
      }));
      result.current.onUp(pointerEvent(canvas, { pointerType: "touch", clientX: 120, clientY: 140, buttons: 0 }));
    });

    expect(commitSelection).toHaveBeenCalledOnce();
  });

  it("uses two fingers for marquee selection without changing camera zoom", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const cam = createCamera();
    const selectionModeRef = { current: false };
    const boxRef = { current: null };
    const setSelectionMode = vi.fn();
    const { result } = renderHook(() => useTouchGestures({
      camRef: { current: cam },
      stateRef: { current: state },
      selectionModeRef,
      boxRef,
      issueContextOrder: vi.fn(),
      setSelectionMode,
    }));
    const canvas = testCanvas();
    const touch = (pointerId: number, overrides: Partial<PointerEvent<HTMLCanvasElement>> = {}) => pointerEvent(canvas, {
      pointerType: "touch",
      pointerId,
      ...overrides,
    });

    act(() => {
      result.current.beginTouch(touch(1), { x: 100, y: 100 });
      result.current.beginTouch(touch(2), { x: 200, y: 200 });
      result.current.moveTouch(touch(2, { clientX: 240, clientY: 220 }), { x: 240, y: 220 });
    });

    expect(cam.zoom).toBe(1);
    expect(selectionModeRef.current).toBe(true);
    expect(setSelectionMode).toHaveBeenCalledWith(true);
    expect(boxRef.current).toEqual({ x0: 100, y0: 100, x1: 240, y1: 220 });

    expect(result.current.endTouch(touch(1, { clientX: 100, clientY: 100 }), { x: 100, y: 100 })).toBe(true);
    expect(result.current.endTouch(touch(2, { clientX: 240, clientY: 220 }), { x: 240, y: 220 })).toBe(false);
  });
});

describe("command markers", () => {
  it("does not leave a marker after an invalid building placement", () => {
    const canvas = testCanvas();
    const { result, state } = renderInput(canvas, { placeKind: "power" });
    const cam = createCamera();
    const p = tileToScreen(0, 0, cam, heightAt(state, 0, 0));

    act(() => {
      result.current.onUp(pointerEvent(canvas, {
        clientX: p.x + 10,
        clientY: p.y + 20,
        buttons: 0,
      }));
    });

    expect(result.current.commandMarkerRef.current).toBeNull();
  });

  it("pings and voices an attack-and-continue order, and stays quiet with no selection", () => {
    const canvas = testCanvas();
    const { result: empty } = renderInput(canvas);
    vi.mocked(voiceBarkForBeep).mockClear();
    act(() => {
      empty.current.onUp(pointerEvent(canvas, { button: 2, buttons: 0 }));
    });
    expect(empty.current.commandMarkerRef.current).toBeNull();
    expect(voiceBarkForBeep).not.toHaveBeenCalled();

    const selected = new Set<number>();
    const { result: armed } = renderInput(canvas, {
      setup: (state) => {
        selected.add(addUnit(state, 0, "infantry", 2, 2).id);
      },
      selected,
    });
    vi.mocked(voiceBarkForBeep).mockClear();
    act(() => {
      armed.current.onUp(pointerEvent(canvas, { button: 2, buttons: 0 }));
    });
    expect(armed.current.commandMarkerRef.current?.kind).toBe("attack");
    expect(voiceBarkForBeep).toHaveBeenCalledOnce();
    expect(voiceBarkForBeep).toHaveBeenCalledWith("ackAttack");
  });
});

describe("double-click selection", () => {
  it("selects all on-screen units of the clicked kind", () => {
    const canvas = testCanvas();
    const cam = createCamera();
    let firstId = 0;
    let secondId = 0;
    const { result, commitSelection, state } = renderInput(canvas, {
      setup: (s) => {
        firstId = addUnit(s, 0, "tank", 5, 5).id;
        secondId = addUnit(s, 0, "tank", 6, 5).id;
        addUnit(s, 0, "infantry", 5, 6);
      },
    });
    const tank = state.entities.find((entity) => entity.id === firstId)!;
    const pos = tileToScreen(tank.x, tank.y, cam, heightAt(state, Math.round(tank.x), Math.round(tank.y)));
    const click = pointerEvent(canvas, {
      clientX: pos.x + 10,
      clientY: pos.y + TILE_H / 2 - 12 + 20,
      buttons: 0,
    });

    act(() => {
      result.current.onDown(click);
      result.current.onUp(click);
      result.current.onDown(click);
      result.current.onUp(click);
    });

    expect(commitSelection).toHaveBeenCalledTimes(2);
    expect(commitSelection).toHaveBeenNthCalledWith(1, [firstId]);
    expect(commitSelection).toHaveBeenNthCalledWith(2, [firstId, secondId]);
  });
});

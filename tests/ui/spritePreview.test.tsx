// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandCameo } from "../../components/game/CommandCameo";
import { SpritePreview } from "../../components/game/SpritePreview";
import { SPRITE_PREVIEW_HEIGHT, SPRITE_PREVIEW_WIDTH } from "../../lib/render/spritePreview";
import type { FactionVisualProfile, Palette } from "../../lib/types";

const mocks = vi.hoisted(() => ({
  buildingSprite: vi.fn(() => ({
    id: "building:power",
    kind: "building",
    w: 100,
    h: 80,
    palette: {},
    shapes: [],
    imageSrc: "/art/power.webp",
    imageCrop: { x: 0, y: 40, w: 100, h: 40, sourceW: 100, sourceH: 80 },
  })),
  unitSprite: vi.fn(() => ({
    id: "unit:infantry",
    kind: "unit",
    w: 64,
    h: 60,
    palette: {},
    shapes: [],
    imageSrc: "/art/infantry.webp",
  })),
  drawSprite: vi.fn(),
  rasterize: vi.fn(() => ({ width: 200, height: 160 })),
  spriteContentBounds: vi.fn(() => ({ minX: 8, minY: 12, width: 40, height: 20 })),
  drawUnitShadow: vi.fn(),
  unitMovementOffset: vi.fn(),
  paintBuildingAssetOverlay: vi.fn(),
}));

vi.mock("@/lib/gen/assets", () => ({
  buildingSprite: mocks.buildingSprite,
  unitSprite: mocks.unitSprite,
}));
vi.mock("@/lib/render/sprites", () => ({
  drawSprite: mocks.drawSprite,
  rasterize: mocks.rasterize,
  spriteContentBounds: mocks.spriteContentBounds,
}));
vi.mock("@/lib/render/unitMotion", () => ({ drawUnitShadow: mocks.drawUnitShadow }));
vi.mock("@/lib/render/anim", () => ({ unitMovementOffset: mocks.unitMovementOffset }));
vi.mock("@/lib/render/previewEffects", () => ({ paintBuildingAssetOverlay: mocks.paintBuildingAssetOverlay }));
vi.mock("@/lib/render/gl/modelLoader", () => ({ buildTurretHeadModel: vi.fn() }));
vi.mock("@/lib/render/gl/modelRenderer", () => ({ draw3dModel: vi.fn() }));

const palette: Palette = {
  primary: "#4a7",
  secondary: "#253",
  accent: "#fd0",
  outline: "#111",
  light: "#8c8",
  dark: "#131",
};
const profile: FactionVisualProfile = {
  designFamily: 0,
  material: "brushed",
  trimPattern: 0,
  insignia: 0,
  weathering: 0,
  lightRig: "cyan",
};

function createContext() {
  return {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
  } as unknown as CanvasRenderingContext2D;
}

describe("SpritePreview", () => {
  let context: CanvasRenderingContext2D;

  beforeEach(() => {
    context = createContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => context,
    );
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders building cards at high resolution with shared building accents", () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const { container } = render(<SpritePreview kind="power" palette={palette} profile={profile} />);

    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    if (!canvas) return;
    expect(canvas).toHaveAttribute("width", String(SPRITE_PREVIEW_WIDTH * 2));
    expect(canvas).toHaveAttribute("height", String(SPRITE_PREVIEW_HEIGHT * 2));
    expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe("high");
    expect(mocks.drawSprite).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ minX: 8, minY: 12, width: 40, height: 20 }),
    );
    expect(mocks.paintBuildingAssetOverlay).toHaveBeenCalledWith(
      expect.anything(),
      "power",
      SPRITE_PREVIEW_WIDTH / 2,
      SPRITE_PREVIEW_HEIGHT / 2,
      expect.any(Number),
      0,
      3,
      false,
      palette,
    );
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("scales the default turret overlay to match its base", () => {
    render(<SpritePreview kind="turret" palette={palette} profile={profile} />);

    expect(mocks.paintBuildingAssetOverlay).toHaveBeenCalledWith(
      expect.anything(),
      "turret",
      SPRITE_PREVIEW_WIDTH / 2,
      SPRITE_PREVIEW_HEIGHT / 2 - 8,
      expect.closeTo(3.44 * 2, 5),
      0,
      3,
      false,
      palette,
    );
  });

  it("uses the complete authored anti-air silhouette in sidebar portraits", () => {
    mocks.buildingSprite.mockReturnValueOnce({
      id: "building:anti-air",
      kind: "building",
      w: 100,
      h: 80,
      palette: {},
      shapes: [],
      imageSrc: "/art/anti-air-turret.webp",
      imageCrop: { x: 0, y: 40, w: 100, h: 40, sourceW: 100, sourceH: 80 },
    });
    render(<SpritePreview kind="antiAirTurret" palette={palette} profile={profile} />);

    expect(mocks.rasterize).toHaveBeenCalledWith(
      expect.objectContaining({
        imageSrc: "/art/anti-air-turret.webp",
        imageCrop: undefined,
      }),
      expect.any(Function),
    );
    expect(mocks.paintBuildingAssetOverlay).not.toHaveBeenCalled();
  });

  it("keeps unit portraits static in the sidebar", () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const previews = (["infantry", "antiArmor", "medic"] as const).map((kind) => render(
      <SpritePreview kind={kind} palette={palette} profile={profile} />,
    ));

    expect(previews.every(({ container }) => container.querySelector("canvas"))).toBe(true);
    expect(mocks.drawUnitShadow).toHaveBeenCalled();
    expect(mocks.paintBuildingAssetOverlay).not.toHaveBeenCalled();
    expect(mocks.unitMovementOffset).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();

    previews.forEach(({ unmount }) => unmount());

    expect(clearIntervalSpy).not.toHaveBeenCalled();
  });

  it("keeps both building and unit previews attached to sidebar item cards", () => {
    render(
      <>
        <CommandCameo
          kind="power"
          palette={palette}
          profile={profile}
          cost={300}
          cameo={{ ratio: 0, queued: 0, phase: "idle" }}
          onClick={vi.fn()}
        />
        <CommandCameo
          kind="infantry"
          palette={palette}
          profile={profile}
          cost={100}
          cameo={{ ratio: 0, queued: 0, phase: "idle" }}
          onClick={vi.fn()}
        />
      </>,
    );

    expect(screen.getByRole("button", { name: /Power Plant, 300 credits/ }).querySelector("canvas")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Infantry, 100 credits/ }).querySelector("canvas")).toBeTruthy();
  });

  it("renders a square cancel button on busy queued cameos", () => {
    const onContextMenu = vi.fn();
    render(
      <CommandCameo
        kind="turret"
        palette={palette}
        profile={profile}
        cost={275}
        cameo={{ ratio: 0.58, queued: 2, phase: "progress" }}
        onClick={vi.fn()}
        onContextMenu={onContextMenu}
      />,
    );

    const cancel = screen.getByRole("button", { name: "Cancel Gun Turret" });
    expect(cancel).toBeInTheDocument();
    expect(cancel).toHaveAttribute("data-testid", "cameo-cancel-turret");
    expect(cancel.className).toContain("cancel");
    expect(cancel.querySelector("[aria-hidden='true']")).toHaveTextContent("×");
  });
});

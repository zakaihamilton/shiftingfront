import { describe, expect, it, vi } from "vitest";

const renderWorldMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/render/renderer", () => ({ renderWorld: renderWorldMock }));

import { renderCinemaFrame } from "../../components/shared/ambient/menuBackdropSim/render";
import { createCinemaScene } from "../../components/shared/ambient/menuBackdropSim/scene";

describe("welcome preview renderer", () => {
  it("uses the gameplay renderer when gameplay mode is requested", () => {
    const scene = createCinemaScene();
    const context = {} as CanvasRenderingContext2D;
    const camera = { x: 0, y: 0, zoom: 1 };

    renderCinemaFrame(context, 768, 512, 1, scene, [], { camera, renderMode: "gameplay" });

    expect(renderWorldMock).toHaveBeenCalledTimes(1);
    expect(renderWorldMock).toHaveBeenCalledWith(
      context,
      scene.state,
      camera,
      expect.any(Set),
      null,
      expect.objectContaining({ fx: scene.fx }),
    );
  });
});

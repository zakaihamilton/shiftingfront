import type { CSSProperties, PointerEventHandler, Ref } from "react";
import { minimapMapRect } from "@/lib/render/camera";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import styles from "./MinimapFrame.module.css";

export type MinimapPing = {
  kind: "urgent" | "objective";
  x: number;
  y: number;
};

export function MinimapFrame({
  canvasRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  isDragging,
  ping,
  mapWidth,
  mapHeight,
}: {
  canvasRef: Ref<HTMLCanvasElement>;
  onPointerDown: PointerEventHandler<HTMLCanvasElement>;
  onPointerMove: PointerEventHandler<HTMLCanvasElement>;
  onPointerUp: PointerEventHandler<HTMLCanvasElement>;
  isDragging: boolean;
  ping?: MinimapPing;
  mapWidth: number;
  mapHeight: number;
}) {
  const mapRect = minimapMapRect(224, 160, mapWidth, mapHeight);
  const pingStyle = ping ? {
    "--ping-x": `${((mapRect.x + ping.x * mapRect.width) / 224) * 100}%`,
    "--ping-y": `${((mapRect.y + ping.y * mapRect.height) / 160) * 100}%`,
  } as CSSProperties : undefined;

  return (
    <div className={styles.host} data-tooltip="Minimap. Click or drag to look around. Press H to jump to your base." data-shortcut={SHORTCUT.home}>
      <div className={styles.frame}>
        <div className={styles.canvasFrame}>
          <canvas
            ref={canvasRef}
            width={224}
            height={160}
            className={styles.canvas}
            data-testid="tactical-radar"
            data-dragging={isDragging ? "true" : undefined}
            role="img"
            tabIndex={0}
            aria-label="Minimap. Click or drag to look around. Press H to jump to your base."
            aria-keyshortcuts="H"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          <span className={styles.sweep} aria-hidden />
          {ping ? (
            <span
              className={styles.ping}
              data-kind={ping.kind}
              style={pingStyle}
              aria-label={ping.kind === "urgent" ? "Urgent alert location" : "Objective transition"}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

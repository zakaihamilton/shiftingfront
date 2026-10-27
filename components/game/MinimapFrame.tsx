import { useEffect, useState, type CSSProperties, type PointerEventHandler, type Ref } from "react";
import { minimapMapRect } from "@/lib/render/camera";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import styles from "./MinimapFrame.module.css";

export type MinimapPing = {
  kind: "urgent" | "objective";
  x: number;
  y: number;
};

export const MINIMAP_POWER_ON_MS = 820;
export const MINIMAP_POWER_OFF_MS = 640;

type RadarPhase = "off" | "powering-on" | "on" | "powering-off";

const ONLINE_LABEL = "Minimap. Click or drag to look around. Press H to jump to your base.";
const OFFLINE_COPY = {
  radar: {
    label: "Minimap offline. Build a Radar to restore the picture.",
    caption: "Radar offline",
  },
  power: {
    label: "Minimap offline. Restore power to bring the picture back.",
    caption: "Low power",
  },
} as const;

export type MinimapOfflineCause = keyof typeof OFFLINE_COPY;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches === true;
}

export function MinimapFrame({
  canvasRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  isDragging,
  ping,
  mapWidth,
  mapHeight,
  powered,
  offlineCause = "radar",
}: {
  canvasRef: Ref<HTMLCanvasElement>;
  onPointerDown: PointerEventHandler<HTMLCanvasElement>;
  onPointerMove: PointerEventHandler<HTMLCanvasElement>;
  onPointerUp: PointerEventHandler<HTMLCanvasElement>;
  isDragging: boolean;
  ping?: MinimapPing;
  mapWidth: number;
  mapHeight: number;
  powered: boolean;
  offlineCause?: MinimapOfflineCause;
}) {
  const [phase, setPhase] = useState<RadarPhase>(powered ? "on" : "off");
  const [seenPower, setSeenPower] = useState(powered);
  // Restart the cathode-ray transition in render when radar power changes.
  // The timeout below only settles the animation; it does not decide the phase.
  if (powered !== seenPower) {
    setSeenPower(powered);
    setPhase(prefersReducedMotion()
      ? (powered ? "on" : "off")
      : (powered ? "powering-on" : "powering-off"));
  }

  useEffect(() => {
    if (phase !== "powering-on" && phase !== "powering-off") return;
    const finishing = phase === "powering-on" ? "on" : "off";
    const delay = phase === "powering-on" ? MINIMAP_POWER_ON_MS : MINIMAP_POWER_OFF_MS;
    const timer = window.setTimeout(() => setPhase(finishing), delay);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const interactive = phase === "on" || phase === "powering-on";
  const offline = OFFLINE_COPY[offlineCause];
  const label = interactive ? ONLINE_LABEL : offline.label;
  const showOffline = phase === "off" || phase === "powering-off";
  const mapRect = minimapMapRect(224, 160, mapWidth, mapHeight);
  const pingStyle = ping ? {
    "--ping-x": `${((mapRect.x + ping.x * mapRect.width) / 224) * 100}%`,
    "--ping-y": `${((mapRect.y + ping.y * mapRect.height) / 160) * 100}%`,
  } as CSSProperties : undefined;
  const guard = (handler: PointerEventHandler<HTMLCanvasElement>): PointerEventHandler<HTMLCanvasElement> => (event) => {
    if (!interactive) return;
    handler(event);
  };

  return (
    <div
      className={styles.host}
      data-testid="minimap-frame"
      data-power={phase}
      data-offline-cause={interactive ? undefined : offlineCause}
      data-tooltip={label}
      data-shortcut={SHORTCUT.home}
    >
      <div className={styles.frame}>
        <div className={styles.canvasFrame}>
          <div className={styles.picture} data-power={phase}>
            <canvas
              ref={canvasRef}
              width={224}
              height={160}
              className={styles.canvas}
              data-testid="tactical-radar"
              data-dragging={isDragging ? "true" : undefined}
              data-offline={interactive ? undefined : "true"}
              role="img"
              tabIndex={interactive ? 0 : -1}
              aria-disabled={interactive ? undefined : true}
              aria-label={label}
              aria-keyshortcuts="H"
              onPointerDown={guard(onPointerDown)}
              onPointerMove={guard(onPointerMove)}
              onPointerUp={guard(onPointerUp)}
              onPointerCancel={guard(onPointerUp)}
            />
            <span className={styles.sweep} aria-hidden />
            {ping && interactive ? (
              <span
                className={styles.ping}
                data-kind={ping.kind}
                style={pingStyle}
                aria-label={ping.kind === "urgent" ? "Urgent alert location" : "Objective transition"}
              />
            ) : null}
          </div>
          <div className={styles.beam} data-power={phase} aria-hidden />
          <div className={styles.snow} data-power={phase} aria-hidden />
          <p className={styles.offline} data-power={phase} hidden={!showOffline}>{offline.caption}</p>
        </div>
      </div>
    </div>
  );
}

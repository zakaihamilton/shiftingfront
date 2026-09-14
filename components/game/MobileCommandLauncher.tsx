import { useRef, type PointerEvent as ReactPointerEvent, type Ref } from "react";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import styles from "./MobileCommandLauncher.module.css";

export function MobileCommandLauncher({
  open,
  onToggle,
  buttonRef,
  statusText = "No selection · Commands",
  onDrag,
  tutorialFocus,
}: {
  open: boolean;
  onToggle: () => void;
  buttonRef: Ref<HTMLButtonElement>;
  statusText?: string;
  onDrag?: (direction: "open" | "close") => void;
  tutorialFocus?: string;
}) {
  const dragStartRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragStartRef.current = event.clientY;
    suppressClickRef.current = false;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events used by accessibility and browser tests may not support capture.
    }
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (start === null) return;
    const delta = start - event.clientY;
    if (Math.abs(delta) < 28) return;
    suppressClickRef.current = true;
    event.preventDefault();
    onDrag?.(delta > 0 ? "open" : "close");
  };
  const onPointerCancel = () => {
    dragStartRef.current = null;
    suppressClickRef.current = false;
  };
  const onToggleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onToggle();
  };

  return (
    <>
      {open ? (
        <button
          type="button"
          className={styles.scrim}
          aria-label="Close commands"
          data-testid="mobile-command-scrim"
          onClick={onToggle}
        />
      ) : null}
      <div
        className={styles.launcher}
        data-tutorial-focus={tutorialFocus}
        data-open={open ? "true" : "false"}
        data-snap={open ? "expanded" : "collapsed"}
        data-testid="mobile-command-launcher"
      >
        <span className={styles.status} data-testid="mobile-command-status">{statusText}</span>
        <span
          className={styles.handle}
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        />
        <ConsoleButton
          ref={buttonRef}
          className={styles.button}
          aria-expanded={open}
          aria-controls="command-sidebar"
          aria-label={open ? "Close commands" : "Open commands"}
          data-testid="mobile-command-toggle"
          onClick={onToggleClick}
        >
          <svg
            className={styles.icon}
            data-testid="mobile-command-icon"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M3 6h18" />
            <path d="M3 12h18" />
            <path d="M3 18h18" />
          </svg>
        </ConsoleButton>
      </div>
    </>
  );
}

import type { ReactNode, RefObject } from "react";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { CodeInput } from "@/components/shared/CodeInput";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import styles from "./SeedEntry.module.css";

export function SeedEntry({
  code,
  error,
  previewLine,
  inputRef,
  onChange,
  onRandomize,
  onThisWeek,
  thisWeekDisabled = false,
  showPreviewLine = true,
  trailingAction,
  onLaunch,
}: {
  code: string;
  error: string;
  previewLine: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onRandomize: () => void;
  onThisWeek?: () => void;
  thisWeekDisabled?: boolean;
  showPreviewLine?: boolean;
  trailingAction?: ReactNode;
  onLaunch: () => void;
}) {
  return (
    <div className={styles.block}>
      <div className={styles.row}>
        <CodeInput
          value={code}
          length={4}
          label="Four digit campaign code"
          inputRef={inputRef}
          onChange={onChange}
          normalize={(value) => value.replace(/\D/g, "")}
          onEnter={onLaunch}
        />
        <div className={styles.seedActions}>
          <ConsoleButton
            className={styles.roll}
            tooltip="Roll a random campaign"
            shortcut={SHORTCUT.randomize}
            onClick={onRandomize}
          >
            Roll
          </ConsoleButton>
          {onThisWeek && (
            <ConsoleButton
              muted
              className={styles.thisWeek}
              tooltip={thisWeekDisabled ? "Already on this week's campaign" : "Return to this week's campaign"}
              onClick={onThisWeek}
              disabled={thisWeekDisabled}
            >
              This Week
            </ConsoleButton>
          )}
          {trailingAction}
        </div>
      </div>
      <div className={`${styles.status} ${showPreviewLine ? "" : styles.statusCompact}`}>
        {showPreviewLine ? <p className={styles.preview}>{previewLine}</p> : null}
        <p className={styles.error} aria-live="polite">{error || "\u00a0"}</p>
      </div>
    </div>
  );
}

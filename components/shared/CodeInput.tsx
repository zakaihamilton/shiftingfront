import type { RefObject } from "react";
import { cx } from "@/lib/ui/cx";
import styles from "./CodeInput.module.css";

type Props = {
  value: string;
  length: number;
  label: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  normalize: (value: string) => string;
  onEnter?: () => void;
  id?: string;
  testId?: string;
  inputMode?: "numeric" | "text";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  className?: string;
};

export function CodeInput({
  value,
  length,
  label,
  inputRef,
  onChange,
  normalize,
  onEnter,
  id,
  testId,
  inputMode = "numeric",
  autoCapitalize = "none",
  className,
}: Props) {
  return (
    <div className={cx(styles.wrap, className)}>
      <div className={styles.digits} data-length={length} aria-hidden="true">
        {Array.from({ length }, (_, index) => (
          <div key={index} className={styles.cell}>
            {value[index] ?? "·"}
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        id={id}
        data-testid={testId}
        type="text"
        value={value}
        onFocus={(event) => {
          if (value.length === length) event.currentTarget.select();
        }}
        onMouseUp={(event) => {
          if (value.length !== length) return;
          event.preventDefault();
          event.currentTarget.select();
        }}
        onChange={(event) => {
          const next = normalize(event.currentTarget.value).slice(0, length);
          event.currentTarget.value = next;
          onChange(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onEnter) {
            event.preventDefault();
            onEnter();
          }
        }}
        maxLength={length}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        autoComplete="off"
        spellCheck={false}
        aria-label={label}
        className={styles.input}
      />
    </div>
  );
}

import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cx } from "@/lib/ui/cx";
import styles from "./ConsoleButton.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  muted?: boolean;
  tooltip?: string;
  shortcut?: string;
  tooltipPos?: string;
};

export const ConsoleButton = forwardRef<HTMLButtonElement, Props>(function ConsoleButton(
  { muted, tooltip, shortcut, tooltipPos, className, type = "button", ...props },
  ref,
) {
  const isDefaultAction = shortcut === "Enter";
  return (
    <button
      ref={ref}
      type={type}
      className={cx(styles.button, muted && styles.muted, className)}
      {...props}
      data-tooltip={tooltip}
      data-shortcut={shortcut}
      data-default-action={isDefaultAction ? "true" : undefined}
      data-tooltip-pos={tooltipPos}
    />
  );
});

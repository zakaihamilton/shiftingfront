import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/ui/cx";
import { ConsoleLabel } from "./ConsoleLabel";
import styles from "./ConsoleNotice.module.css";
import { MetalPanel } from "./MetalPanel";

export function ConsoleNotice({
  eyebrow,
  title,
  detail,
  testId,
  role = "alert",
  children,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
  testId?: string;
  role?: "alert" | "status";
  children?: ReactNode;
}) {
  return (
    <div className={styles.wrap} role={role} data-testid={testId}>
      <MetalPanel className={styles.panel}>
        <ConsoleLabel>{eyebrow}</ConsoleLabel>
        <h2 className={styles.title}>{title}</h2>
        {detail ? <p className={styles.detail}>{detail}</p> : null}
        {children ? <div className={styles.actions}>{children}</div> : null}
      </MetalPanel>
    </div>
  );
}

export function ConsoleNoticeLink({
  href,
  children,
  muted,
  testId,
}: {
  href: string;
  children: ReactNode;
  muted?: boolean;
  testId?: string;
}) {
  return (
    <Link href={href} className={cx(styles.link, muted && styles.linkMuted)} data-testid={testId}>
      {children}
    </Link>
  );
}

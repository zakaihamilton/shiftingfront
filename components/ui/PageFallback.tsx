import { ConsoleLabel } from "./ConsoleLabel";
import { MetalPanel } from "./MetalPanel";
import styles from "./PageFallback.module.css";

export function PageFallback({ children }: { children: string }) {
  return (
    <div
      className={styles.root}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="page-fallback"
    >
      <MetalPanel className={styles.panel}>
        <ConsoleLabel>Stand by</ConsoleLabel>
        <p className={styles.copy}>{children}</p>
        <div className={styles.pulse} aria-hidden="true" />
      </MetalPanel>
    </div>
  );
}

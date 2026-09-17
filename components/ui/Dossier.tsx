import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { cx } from "@/lib/ui/cx";
import styles from "./Dossier.module.css";

export type DossierTone = "cyan" | "gold" | "success" | "alert" | "muted";

type DossierSectionProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  as?: ElementType;
  label?: ReactNode;
  title?: ReactNode;
  aside?: ReactNode;
};

export function DossierSection({
  as: Tag = "section",
  label,
  title,
  aside,
  className,
  children,
  ...props
}: DossierSectionProps) {
  const hasHeader = label || title || aside;

  return (
    <Tag className={cx(styles.section, className)} {...props}>
      {hasHeader ? (
        <header className={styles.sectionHeader}>
          <div className={styles.sectionIdentity}>
            {label ? <ConsoleLabel>{label}</ConsoleLabel> : null}
            {title}
          </div>
          {aside}
        </header>
      ) : null}
      {children}
    </Tag>
  );
}

export type DossierMetric = {
  label: ReactNode;
  value: ReactNode;
  progress?: number;
  tone?: DossierTone;
};

export function MetricCluster({
  items,
  className,
  ...props
}: HTMLAttributes<HTMLDListElement> & { items: DossierMetric[] }) {
  return (
    <dl className={cx(styles.metricCluster, className)} {...props}>
      {items.map((item, index) => (
        <div key={index} data-tone={item.tone}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {typeof item.progress === "number" ? (
            <span className={styles.metricTrack} aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }} />
            </span>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

export function StatusBadge({
  tone = "cyan",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: DossierTone }) {
  return (
    <span className={cx(styles.statusBadge, className)} data-tone={tone} {...props}>
      {children}
    </span>
  );
}

type ArtBackedCardProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  art?: string;
};

export function ArtBackedCard({
  as: Tag = "div",
  art,
  className,
  style,
  ...props
}: ArtBackedCardProps) {
  const artStyle = art
    ? ({ ...style, "--dossier-art": `url("${art}")` } as CSSProperties)
    : style;

  return <Tag className={cx(styles.artCard, className)} style={artStyle} {...props} />;
}

export function ActionRail({
  as: Tag = "div",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: ElementType }) {
  return <Tag className={cx(styles.actionRail, className)} {...props} />;
}

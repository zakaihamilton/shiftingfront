import type { ReactNode } from "react";
import Link from "next/link";
import { ConsoleNoticeLink } from "./ConsoleNotice";
import { EscapeToHome } from "./EscapeToHome";
import styles from "@/app/legal.module.css";

export function LegalDocument({
  eyebrow,
  title,
  lastUpdated,
  children,
  otherLinkHref,
  otherLinkLabel,
}: {
  eyebrow: string;
  title: string;
  lastUpdated: string;
  children: ReactNode;
  otherLinkHref: string;
  otherLinkLabel: string;
}) {
  return (
    <div className={styles.page}>
      <EscapeToHome />
      <main className={styles.container}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>{eyebrow}</div>
          <h1 className={styles.title}>{title}</h1>
          <div className={styles.lastUpdated}>{lastUpdated}</div>
        </header>

        <section className={styles.content}>{children}</section>

        <footer className={styles.footer}>
          <ConsoleNoticeLink href="/" muted>
            &larr; Return to Main Menu
          </ConsoleNoticeLink>
          <div className={styles.otherLinks}>
            <Link href={otherLinkHref}>{otherLinkLabel}</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}

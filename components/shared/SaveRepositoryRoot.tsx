"use client";
import { useEffect, useState, type ReactNode } from "react";
import { initializeSaveRepository } from "@/lib/persist/save/repository";
import { PageFallback } from "@/components/ui/PageFallback";
import styles from "./SaveRepositoryRoot.module.css";

export function SaveRepositoryRoot({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void initializeSaveRepository().then((repository) => {
      if (active) {
        setNotice(repository.notice); setReady(true);
        unsubscribe = repository.subscribe(() => setNotice(repository.notice));
      }
    }).catch(() => {
      if (active) {
        setNotice("Using legacy browser saves. Save recovery and multi-tab protection are reduced; export important saves as a backup.");
        setReady(true);
      }
    });
    return () => { active = false; unsubscribe?.(); };
  }, []);
  if (!ready) return <PageFallback>Loading saved campaigns…</PageFallback>;
  return <>{notice ? <p className={styles.notice} role="status" data-testid="save-repository-notice">{notice}</p> : null}{children}</>;
}

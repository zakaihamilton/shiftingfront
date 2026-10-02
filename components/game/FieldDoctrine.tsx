import { useEffect, useMemo, useState } from "react";
import type { DoctrineHint } from "@/lib/ui/doctrine";
import styles from "./Battlefield.module.css";

export function FieldDoctrine({ doctrineHints = [] }: { doctrineHints?: DoctrineHint[] }) {
  const [seenDoctrine] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(window.sessionStorage.getItem("shifting-front:doctrine") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const visibleDoctrine = useMemo(
    () => doctrineHints.filter((hint) => !seenDoctrine.has(hint.id)),
    [doctrineHints, seenDoctrine],
  );
  const doctrineKey = doctrineHints.map((hint) => hint.id).join("|");

  useEffect(() => {
    if (!doctrineKey || typeof window === "undefined") return;
    let next = new Set<string>();
    try {
      next = new Set(JSON.parse(window.sessionStorage.getItem("shifting-front:doctrine") ?? "[]"));
    } catch {
      // Session storage is optional.
    }
    const hintIds = doctrineKey.split("|").filter(Boolean);
    hintIds.forEach((id) => next.add(id));
    try {
      window.sessionStorage.setItem("shifting-front:doctrine", JSON.stringify([...next]));
    } catch {
      // Session storage is optional; the hint remains presentation-only.
    }
    // Persist categories without hiding the current mission's first render.
  }, [doctrineKey]);

  if (!visibleDoctrine.length) return null;
  return (
    <section className={styles.doctrine} aria-label="Field doctrine" data-testid="field-doctrine">
      <div className={styles.doctrineHeader}>Field doctrine <span>once per session</span></div>
      <div className={styles.doctrineList}>
        {visibleDoctrine.map((hint) => (
          <div className={styles.doctrineItem} key={hint.id}>
            <strong>{hint.label}</strong>
            <span>{hint.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

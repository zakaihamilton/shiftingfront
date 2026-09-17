import { memo } from "react";
import { cx } from "@/lib/ui/cx";
import type { FaceTone } from "@/lib/render/portraits";
import type { Character } from "@/lib/types";
import { characterLabel } from "@/lib/gen/names";
import { Face } from "@/components/shared/Face";
import styles from "./Portrait.module.css";

export const Portrait = memo(function Portrait({
  who,
  talking,
  tone,
  faction,
}: {
  who: Character;
  talking: boolean;
  tone: FaceTone;
  faction: string;
}) {
  return (
    <div className={cx(styles.frame, talking && styles.live)} data-tone={tone}>
      <div className={styles.meta}>
        <span>{tone === "enemy" ? "Hostile" : "Channel"}</span>
        <span className={talking ? styles.statusLive : styles.status}>{talking ? "Live" : "Standby"}</span>
      </div>
      <Face who={who} talking={talking} tone={tone} />
      <p className={styles.name}>{characterLabel(who)}</p>
      <p className={styles.faction}>{faction}</p>
    </div>
  );
});

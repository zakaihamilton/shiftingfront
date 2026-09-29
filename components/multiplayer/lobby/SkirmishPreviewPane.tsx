import type { CSSProperties } from "react";
import { biomeLabel } from "@/lib/gen/names";
import { biomeArt } from "@/lib/gen/visualAssets";
import type { BiomeName } from "@/lib/types";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import styles from "@/components/menu/NewGameSetup.module.css";

export function SkirmishPreviewPane({ biome, className }: { biome: BiomeName | null; className?: string }) {
  const paneClassName = className ? `${styles.infoPane} ${className}` : styles.infoPane;

  return (
    <div className={paneClassName} data-testid="multiplayer-skirmish-preview">
      {biome ? (
        <>
          <div
            className={styles.backdrop}
            style={{ "--campaign-art": `url("${biomeArt(biome)}")` } as CSSProperties}
            role="img"
            aria-label={`${biomeLabel(biome)} skirmish backdrop`}
            data-testid="multiplayer-skirmish-backdrop"
          />
          <div className={styles.infoContent}>
            <ConsoleLabel>Skirmish preview</ConsoleLabel>
            <h3 className={styles.campaignTitle}>Versus Skirmish</h3>
            <p className={styles.worldContext}>{biomeLabel(biome)} · Free-for-all</p>
            <div className={styles.infoMeta} data-testid="multiplayer-skirmish-details">
              <div>
                <span className={styles.detailLabel}>Arena</span>
                <strong>80 × 80 · Four corner starts</strong>
              </div>
              <div>
                <span className={styles.detailLabel}>Players</span>
                <strong>2–4</strong>
              </div>
              <div>
                <span className={styles.detailLabel}>Victory</span>
                <strong>Destroy enemy construction yards</strong>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.emptyInfo} role="status">
          <div className={styles.emptyMark} aria-hidden="true">+</div>
          <ConsoleLabel>Skirmish preview</ConsoleLabel>
          <h3 className={styles.emptyTitle}>Choose a seed</h3>
          <p>Enter four digits to preview the arena.</p>
        </div>
      )}
    </div>
  );
}

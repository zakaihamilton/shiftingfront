import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { biomeLabel } from "@/lib/gen/names";
import { objectiveHeadline } from "@/lib/gen/story";
import { formatSeed } from "@/lib/seed/rng";
import type { Campaign, ReadonlyMissionDef } from "@/lib/types";
import styles from "./BriefingMast.module.css";

export function BriefingMast({
  seed,
  mission,
  campaign,
  def,
}: {
  seed: number;
  mission: number;
  campaign: Campaign;
  def: ReadonlyMissionDef;
}) {
  return (
    <header className={styles.mast}>
      <div>
        <ConsoleLabel data-testid="seed">
          Shifting Front · Seed {formatSeed(seed)} · Mission {mission + 1}/{campaign.missions.length}
        </ConsoleLabel>
        <div className={styles.progressStrip} aria-label={`Operation progress: mission ${mission + 1} of ${campaign.missions.length}`}>
          {campaign.missions.map((item, index) => (
            <span key={item.index} className={index <= mission ? styles.progressActive : styles.progressPending} aria-hidden="true" />
          ))}
        </div>
        <h1 className={styles.title}>{def.name}</h1>
        <p className={styles.world}>
          {campaign.world.name} · {biomeLabel(def.biome)} · {campaign.world.era}
        </p>
      </div>
      <p className={styles.aside}>
        {campaign.factions[0].name} campaign brief
        <span className={styles.objective} data-testid="objective">
          {objectiveHeadline(def.win)}
        </span>
      </p>
    </header>
  );
}

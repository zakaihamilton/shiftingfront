import type { Ref } from "react";
import { characterLabel } from "@/lib/gen/names";
import type { BriefingLine, Campaign, CharacterRole } from "@/lib/types";
import { TypewriterBody } from "./TypewriterBody";
import styles from "./BriefingStory.module.css";

function characterFor(campaign: Campaign, role: CharacterRole) {
  if (role === "advisor") return campaign.characters.advisor;
  if (role === "commander") return campaign.characters.commander;
  return campaign.characters.enemyLeader;
}

function channelLabel(role: CharacterRole) {
  return role === "enemyLeader" ? "Hostile" : "Channel";
}

export type RevealedLine = BriefingLine & {
  visible: string;
  started: boolean;
  complete: boolean;
};

export function BriefingStory({
  storyRef,
  campaign,
  lines,
  talking,
  speakerRole,
  compact = false,
}: {
  storyRef: Ref<HTMLDivElement>;
  campaign: Campaign;
  lines: RevealedLine[];
  talking: boolean;
  speakerRole: CharacterRole | undefined;
  compact?: boolean;
}) {
  return (
    <div ref={storyRef} className={`${styles.story}${compact ? ` ${styles.compact}` : ""}`} data-testid="briefing-dialogue">
      {lines.length === 0 ? (
        <p className={styles.empty}>
          Awaiting channel lock
          <span className={styles.caret}>▌</span>
        </p>
      ) : (
        <div className={styles.lines}>
          {lines.map((line, i) => {
            const who = characterFor(campaign, line.speaker);
            const live = talking && speakerRole === line.speaker && !line.complete;
            return (
              <article key={`${line.speaker}:${i}`} className={styles.line} data-role={line.speaker} data-testid="briefing-line">
                <p className={styles.speaker}>
                  <span>{channelLabel(line.speaker)}</span>
                  <span>{characterLabel(who)}</span>
                </p>
                <TypewriterBody text={line.text} visible={line.visible} live={live} />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

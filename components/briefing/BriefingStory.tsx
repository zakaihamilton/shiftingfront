import type { Ref } from "react";
import { Face } from "@/components/shared/Face";
import { characterLabel } from "@/lib/gen/names";
import type { FaceTone } from "@/lib/render/portraits";
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

function toneFor(role: CharacterRole): FaceTone {
  if (role === "advisor") return "ally";
  if (role === "commander") return "command";
  return "enemy";
}

function factionFor(campaign: Campaign, role: CharacterRole) {
  return role === "enemyLeader" ? campaign.factions[1].name : campaign.factions[0].name;
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
  complete,
  onStoryScroll,
}: {
  storyRef: Ref<HTMLDivElement>;
  campaign: Campaign;
  lines: RevealedLine[];
  talking: boolean;
  speakerRole: CharacterRole | undefined;
  complete: boolean;
  onStoryScroll: () => void;
}) {
  return (
    <div
      ref={storyRef}
      className={styles.story}
      onScroll={onStoryScroll}
      data-complete={complete ? "true" : "false"}
      data-testid="briefing-dialogue"
    >
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
              <article
                key={`${line.speaker}:${i}`}
                className={styles.line}
                data-role={line.speaker}
                data-live={live ? "true" : undefined}
                data-testid="briefing-line"
              >
                <div className={styles.avatar} aria-hidden="true">
                  <Face who={who} talking={live} tone={toneFor(line.speaker)} />
                </div>
                <div className={styles.message}>
                  <p className={styles.speaker}>
                    <span>{channelLabel(line.speaker)}</span>
                    <span>{characterLabel(who)}</span>
                  </p>
                  <p className={styles.faction} data-testid="briefing-faction">{factionFor(campaign, line.speaker)}</p>
                  <TypewriterBody text={line.text} visible={line.visible} live={live} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

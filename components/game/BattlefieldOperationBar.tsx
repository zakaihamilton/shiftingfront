import { formatSeed } from "@/lib/seed/rng";
import type { BattlefieldOperationBarProps } from "./BattlefieldHud.types";
import styles from "./Battlefield.module.css";

export function BattlefieldOperationBar({
  seed,
  levelNumber,
  levelCount,
  missionName,
  profileLabel,
  multiplayerPingMs,
  multiplayerHost,
}: BattlefieldOperationBarProps) {
  return (
    <div className={styles.operationBar}>
      <div className={styles.missionMeta}>
        <div className={styles.seed} data-testid="seed"><span className={styles.statusGlyph} aria-hidden="true">◆</span> Seed {formatSeed(seed)}</div>
        <div className={styles.level} data-testid="level-progress">
          <span>Operation {levelNumber} of {levelCount}</span>
          <span className={styles.operationTicks} aria-label={`Operation ${levelNumber} of ${levelCount}`}>
            {Array.from({ length: levelCount }, (_, index) => (
              <span key={index} className={index < levelNumber ? styles.operationTickActive : styles.operationTick} aria-hidden="true" />
            ))}
          </span>
        </div>
        {multiplayerPingMs !== undefined ? (
          <div
            className={styles.networkPing}
            data-testid="multiplayer-rtt"
            title={multiplayerHost ? "Average round-trip time across connected guests" : "Round-trip time to the host"}
            aria-label={`${multiplayerHost ? "Average peer" : "Host"} round-trip time: ${multiplayerPingMs === null ? "measuring" : `${multiplayerPingMs} milliseconds`}`}
          >
            <span>RTT</span>
            <strong>{multiplayerPingMs === null ? "—" : `${multiplayerPingMs} ms`}</strong>
          </div>
        ) : null}
      </div>
      <div className={styles.mission}>{missionName}</div>
      <div className={styles.operationFoot}>
        {profileLabel ? <div className={styles.profile} data-testid="mission-profile">{profileLabel}</div> : null}
      </div>
    </div>
  );
}

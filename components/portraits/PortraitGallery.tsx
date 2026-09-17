"use client";

import { useMemo, useState } from "react";
import { PORTRAIT_ASSETS, type PortraitAsset } from "@/lib/gen/portraitCatalog";
import type { Character, CharacterRole } from "@/lib/types";
import { FaceCanvas } from "@/components/portraits/FaceCanvas";
import { useFacePortrait } from "@/components/portraits/useFacePortrait";
import type { FaceTone } from "@/lib/render/portraits";
import styles from "./PortraitGallery.module.css";

const GROUPS: readonly { role: CharacterRole; label: string; tone: FaceTone }[] = [
  { role: "commander", label: "Commanders", tone: "command" },
  { role: "advisor", label: "Advisors", tone: "ally" },
  { role: "enemyLeader", label: "Enemy leaders", tone: "enemy" },
];

export function PortraitGallery() {
  const [activeRole, setActiveRole] = useState<CharacterRole | "all">("all");
  const visibleGroups = activeRole === "all" ? GROUPS : GROUPS.filter((group) => group.role === activeRole);

  return (
    <main className={styles.page} data-testid="portrait-gallery">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Hidden developer surface / portrait calibration</p>
          <h1>Portrait Lab</h1>
          <p className={styles.description}>
            Inspect every shipped character crop. Toggle a card to preview the production talking-mouth composite.
          </p>
          <div className={styles.filters} role="toolbar" aria-label="Filter portrait roles">
            <button type="button" className={activeRole === "all" ? styles.filterActive : styles.filter} aria-pressed={activeRole === "all"} onClick={() => setActiveRole("all")}>All roles</button>
            {GROUPS.map((group) => (
              <button key={group.role} type="button" className={activeRole === group.role ? styles.filterActive : styles.filter} aria-pressed={activeRole === group.role} onClick={() => setActiveRole(group.role)}>
                {group.label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.counter}>
          <span className={styles.counterValue}>{PORTRAIT_ASSETS.length}</span>
          <span className={styles.counterLabel}>assets online</span>
        </div>
      </header>

      {visibleGroups.map((group) => {
        const assets = PORTRAIT_ASSETS.filter((asset) => asset.role === group.role);
        return (
          <section key={group.role} className={styles.section} aria-labelledby={`${group.role}-heading`}>
            <div className={styles.sectionHeader}>
              <h2 id={`${group.role}-heading`}>{group.label}</h2>
              <span>{assets.length.toString().padStart(2, "0")} portraits</span>
            </div>
            <div className={styles.grid}>
              {assets.map((asset) => (
                <PortraitCard key={asset.id} asset={asset} tone={group.tone} />
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}

function PortraitCard({ asset, tone }: { asset: PortraitAsset; tone: FaceTone }) {
  const [talking, setTalking] = useState(false);
  const portrait = useFacePortrait(asset.id);
  const toggleTalking = () => setTalking((current) => !current);
  const who = useMemo<Character>(
    () => ({
      role: asset.role,
      name: asset.id,
      title: tone === "enemy" ? "Enemy Leader" : tone === "command" ? "Commander" : "Advisor",
      face: { portraitId: asset.id, feminine: asset.feminine },
    }),
    [asset, tone],
  );

  return (
    <article className={styles.card} data-testid={`portrait-card-${asset.id}`} data-tone={tone}>
      <div className={styles.cardHeader}>
        <span className={styles.assetId}>{asset.id}</span>
        <span className={talking ? styles.live : styles.idle}>{talking ? "Live" : "Idle"}</span>
      </div>
      <button
        type="button"
        className={styles.canvasFrame}
        aria-label={`${talking ? "Set" : "Make"} ${asset.id} ${talking ? "idle" : "talk"}`}
        aria-pressed={talking}
        data-testid={`portrait-canvas-toggle-${asset.id}`}
        onClick={toggleTalking}
      >
        <FaceCanvas who={who} talking={talking} tone={tone} portrait={portrait} />
      </button>
      <div className={styles.cardFooter}>
        <div className={styles.calibration}>
          <span>mouth y {asset.mouthCalibration.clip.cy.toFixed(3)}</span>
          <span>
            talk {asset.mouthCalibration.talkOffset.dx === 0 && asset.mouthCalibration.talkOffset.dy === 0
              ? "aligned"
              : `${formatOffset(asset.mouthCalibration.talkOffset.dx)},${formatOffset(asset.mouthCalibration.talkOffset.dy)}`}
          </span>
        </div>
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={talking}
          data-testid={`portrait-toggle-${asset.id}`}
          onClick={toggleTalking}
        >
          {talking ? "Set idle" : "Talk"}
        </button>
      </div>
    </article>
  );
}

function formatOffset(value: number): string {
  return value > 0 ? `+${value}` : value.toString();
}

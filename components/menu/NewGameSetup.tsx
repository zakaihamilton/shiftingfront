import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { biomeLabel } from "@/lib/gen/names";
import { biomeArt } from "@/lib/gen/visualAssets";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import type { Campaign } from "@/lib/types";
import type { CSSProperties, RefObject } from "react";
import { SeedEntry } from "./SeedEntry";
import { weeklySeed } from "./menuLaunch";
import { useWeeklyCountdown } from "./useWeeklyCountdown";
import styles from "./NewGameSetup.module.css";

const LONG_FACTION_CHARS = 24;

export function NewGameSetup({
  code,
  error,
  previewLine,
  preview,
  copied,
  inputRef,
  onChange,
  onRandomize,
  onThisWeek,
  onCopyLink,
  onLaunch,
  onBack,
}: {
  code: string;
  error: string;
  previewLine: string;
  preview: Campaign | null;
  copied: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onRandomize: () => void;
  onThisWeek: () => void;
  onCopyLink: () => void;
  onLaunch: () => void;
  onBack: () => void;
}) {
  const { countdown } = useWeeklyCountdown();
  const isSynchronized = code === weeklySeed();
  const factionLine = preview
    ? `${preview.factions[0].name} vs ${preview.factions[1].name}`
    : "";
  const wideFactions = factionLine.length > LONG_FACTION_CHARS;
  const worldContext = preview
    ? `${biomeLabel(preview.world.biome)} · ${preview.world.era}`
    : "";
  const conflictLine = preview
    ? `${preview.world.conflict.charAt(0).toUpperCase()}${preview.world.conflict.slice(1)}.`
    : "";

  return (
    <MetalPanel as="section" className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="new-game-title" data-testid="deploy-screen">
      <div className={styles.codePane} data-testid="campaign-code-pane">
        <div className={styles.paneTopline}>
          <ConsoleLabel>{isSynchronized ? "Weekly" : "Custom"}</ConsoleLabel>
          <span
            className={styles.paneMarker}
            data-testid="campaign-expiry"
            title={isSynchronized ? "Time until current campaign expires" : undefined}
          >
            {isSynchronized ? `Current campaign expires in ${countdown}` : "4 digits"}
          </span>
        </div>
        <h2 id="new-game-title" className={styles.title}>New campaign</h2>
        <p className={styles.copy}>Enter four digits. Set the front.</p>
        <div className={styles.codeSection}>
          <ConsoleLabel className={styles.seedLabel}>Campaign code</ConsoleLabel>
          <SeedEntry
            code={code}
            error={error}
            previewLine={previewLine}
            showPreviewLine={false}
            inputRef={inputRef}
            onChange={onChange}
            onRandomize={onRandomize}
            onThisWeek={onThisWeek}
            thisWeekDisabled={isSynchronized}
            trailingAction={(
              <ConsoleButton
                muted
                className={styles.copyLink}
                tooltip={copied ? "Link copied!" : "Copy campaign link to clipboard"}
                tooltipPos="above"
                onClick={onCopyLink}
                disabled={!preview}
                aria-label={copied ? "Link copied!" : "Copy link"}
                aria-live="polite"
                data-testid="copy-campaign-link"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                  {copied ? (
                    <path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" />
                  ) : (
                    <>
                      <rect x="8" y="8" width="11" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" />
                      <path d="M16 8V5H5v12h3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" />
                    </>
                  )}
                </svg>
              </ConsoleButton>
            )}
            onLaunch={onLaunch}
          />
        </div>

        <div className={styles.codeFooter}>
          <ConsoleButton
            muted
            className={styles.back}
            tooltip="Return to the main menu"
            shortcut={SHORTCUT.back}
            onClick={onBack}
          >
            Back
          </ConsoleButton>
        </div>
      </div>

      <div className={styles.infoPane} data-testid="campaign-info-pane">
        {preview ? (
          <>
            <div
              className={styles.backdrop}
              style={{ "--campaign-art": `url("${biomeArt(preview.world.biome)}")` } as CSSProperties}
              role="img"
              aria-label={`${biomeLabel(preview.world.biome)} campaign backdrop`}
              data-testid="campaign-backdrop"
            />
            <div className={styles.infoContent}>
              <ConsoleLabel>Campaign preview</ConsoleLabel>
              <h3 className={styles.campaignTitle}>{preview.world.name}</h3>
              <p className={styles.worldContext}>{worldContext}</p>
              <p className={styles.conflict}>{conflictLine}</p>

              <div className={styles.factionMatchup} data-wide={wideFactions ? "true" : undefined} data-testid="campaign-details">
                <div className={styles.faction}>
                  <span className={styles.detailLabel}>You</span>
                  <strong>{preview.factions[0].name}</strong>
                </div>
                <span className={styles.factionVs}>VS</span>
                <div className={`${styles.faction} ${styles.opponent}`}>
                  <span className={styles.detailLabel}>Enemy</span>
                  <strong>{preview.factions[1].name}</strong>
                </div>
              </div>

              <div className={styles.infoMeta}>
                <div>
                  <span className={styles.detailLabel}>Commander</span>
                  <strong>{preview.characters.commander.name}</strong>
                </div>
                <div>
                  <span className={styles.detailLabel}>Operations</span>
                  <strong>6 operations</strong>
                </div>
              </div>

              <ConsoleButton
                className={styles.start}
                tooltip="Begin the first briefing"
                shortcut={SHORTCUT.deploy}
                onClick={onLaunch}
              >
                Start
              </ConsoleButton>
            </div>
          </>
        ) : (
          <div className={styles.emptyInfo} role="status">
            <div className={styles.emptyMark} aria-hidden="true">+</div>
            <ConsoleLabel>Campaign preview</ConsoleLabel>
            <h3 className={styles.emptyTitle}>Choose a code</h3>
            <p>Enter four digits to reveal your campaign.</p>
          </div>
        )}
      </div>
    </MetalPanel>
  );
}

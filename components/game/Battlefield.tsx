import type { CSSProperties, PointerEventHandler, ReactNode, Ref } from "react";
import type { PanAvailability, PanDir } from "@/lib/render/camera";
import { biomeArt } from "@/lib/gen/visualAssets";
import type { MissionObjective } from "@/lib/gen/story";
import type { BiomeName } from "@/lib/types";
import type { ObjectiveCardModel } from "@/lib/ui/missionPresentation";
import type { DoctrineHint } from "@/lib/ui/doctrine";
import { BattlefieldHud } from "./BattlefieldHud";
import { ScrollArrow } from "./ScrollArrow";
import styles from "./Battlefield.module.css";

export function Battlefield({
  hostRef,
  canvasRef,
  tooltipCanvasRef,
  width,
  height,
  panAvail,
  hotPan,
  seed,
  levelNumber,
  levelCount,
  missionName,
  objective,
  profileLabel,
  doctrineHints,
  timeRemaining,
  convoyDeparture,
  briefingObjectives,
  objectiveCards,
  phaseLabel,
  timeRemainingTicks,
  timeLimitTicks,
  onObjectivePanelToggle,
  showHud = true,
  biome,
  children,
  onPointerDown,
  onPointerMove,
  onPointerEnter,
  onPointerLeave,
  onPointerUp,
  onPointerCancel,
}: {
  hostRef: Ref<HTMLDivElement>;
  canvasRef: Ref<HTMLCanvasElement>;
  tooltipCanvasRef: Ref<HTMLCanvasElement>;
  width: number;
  height: number;
  panAvail: PanAvailability;
  hotPan: PanDir | null;
  seed: number;
  levelNumber: number;
  levelCount: number;
  missionName: string;
  objective: string;
  profileLabel?: string;
  doctrineHints?: DoctrineHint[];
  timeRemaining?: string;
  convoyDeparture?: string;
  briefingObjectives?: MissionObjective[];
  objectiveCards?: ObjectiveCardModel[];
  phaseLabel?: string;
  timeRemainingTicks?: number;
  timeLimitTicks?: number;
  onObjectivePanelToggle?: () => void;
  showHud?: boolean;
  biome: BiomeName;
  children?: ReactNode;
  onPointerDown: PointerEventHandler<HTMLCanvasElement>;
  onPointerMove: PointerEventHandler<HTMLCanvasElement>;
  onPointerEnter: PointerEventHandler<HTMLCanvasElement>;
  onPointerLeave: PointerEventHandler<HTMLCanvasElement>;
  onPointerUp: PointerEventHandler<HTMLCanvasElement>;
  onPointerCancel: PointerEventHandler<HTMLCanvasElement>;
}) {
  return (
    <div
      ref={hostRef}
      className={styles.root}
      style={{ "--scene-art": `url("${biomeArt(biome)}")` } as CSSProperties}
    >
      <canvas
        ref={canvasRef}
        data-testid="battlefield-canvas"
        width={width}
        height={height}
        className={styles.canvas}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
      <canvas ref={tooltipCanvasRef} className={styles.tooltipCanvas} aria-hidden="true" />
      <ScrollArrow dir="left" available={panAvail.left} hot={hotPan === "left"} />
      <ScrollArrow dir="right" available={panAvail.right} hot={hotPan === "right"} />
      <ScrollArrow dir="up" available={panAvail.up} hot={hotPan === "up"} />
      <ScrollArrow dir="down" available={panAvail.down} hot={hotPan === "down"} />
      {showHud ? (
        <BattlefieldHud
          seed={seed}
          levelNumber={levelNumber}
          levelCount={levelCount}
          missionName={missionName}
          objective={objective}
          profileLabel={profileLabel}
          doctrineHints={doctrineHints}
          timeRemaining={timeRemaining}
          convoyDeparture={convoyDeparture}
          briefingObjectives={briefingObjectives}
          objectiveCards={objectiveCards}
          phaseLabel={phaseLabel}
          timeRemainingTicks={timeRemainingTicks}
          timeLimitTicks={timeLimitTicks}
          onObjectivePanelToggle={onObjectivePanelToggle}
        />
      ) : null}
      {children}
    </div>
  );
}

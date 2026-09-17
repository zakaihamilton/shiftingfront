import { getPortraitAsset } from "@/lib/gen/portraitCatalog";
import { drawPortraitBackdrop, drawPortraitClippedFrame, drawPortraitFrame, PORTRAIT_EYE_CLIPS, portraitBlinking, portraitSpeechFrame, scalePortraitOffset, PORTRAIT_MEASURE_WIDTH, type FaceTone } from "@/lib/render/portraits";
import type { Character } from "@/lib/types";
import type { FacePortrait } from "./useFacePortrait";

export const FACE_CANVAS_WIDTH = 200;
export const FACE_CANVAS_HEIGHT = 240;

export function paintFaceFrame(ctx: CanvasRenderingContext2D, dpr: number, t: number, who: Character, talking: boolean, tone: FaceTone, portrait: FacePortrait, lastSig: string): string {
  const asset = getPortraitAsset(who.face.portraitId);
  const image = portrait.imageRef.current;
  const loaded = Boolean(asset && image && portrait.loadedIdRef.current === who.face.portraitId);
  const mouthOpen = Boolean(loaded && asset && talking && portraitSpeechFrame(t, who.face.portraitId, asset.frameCount) === 2);
  const blinking = Boolean(loaded && asset && asset.frameCount >= 2 && portraitBlinking(t, who.face.portraitId));
  const sig = `${who.face.portraitId}:${loaded}:${talking}:${mouthOpen}:${blinking}:${tone}`;
  if (sig === lastSig) return sig;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = tone === "enemy" ? "#1c1210" : tone === "command" ? "#12160f" : "#10140c";
  ctx.fillRect(0, 0, FACE_CANVAS_WIDTH, FACE_CANVAS_HEIGHT);
  if (asset && image && loaded) {
    drawPortraitFrame(ctx, image, asset, 0, 0, 0, FACE_CANVAS_WIDTH, FACE_CANVAS_HEIGHT);
    if (mouthOpen) drawPortraitClippedFrame(ctx, image, asset, 2, 0, 0, FACE_CANVAS_WIDTH, FACE_CANVAS_HEIGHT, [portrait.mouthClipRef.current], scalePortraitOffset(portrait.offsetsRef.current.talk, PORTRAIT_MEASURE_WIDTH, FACE_CANVAS_WIDTH), portrait.overlayRef.current ?? (portrait.overlayRef.current = document.createElement("canvas")));
    if (blinking) drawPortraitClippedFrame(ctx, image, asset, 1, 0, 0, FACE_CANVAS_WIDTH, FACE_CANVAS_HEIGHT, PORTRAIT_EYE_CLIPS, portrait.offsetsRef.current.blink, portrait.overlayRef.current ?? (portrait.overlayRef.current = document.createElement("canvas")));
    ctx.fillStyle = tone === "enemy" ? "rgba(126, 48, 35, 0.08)" : "rgba(90, 218, 210, 0.035)";
    ctx.fillRect(0, 0, FACE_CANVAS_WIDTH, FACE_CANVAS_HEIGHT);
  } else drawPortraitBackdrop(ctx, FACE_CANVAS_WIDTH / 2, FACE_CANVAS_HEIGHT / 2 - 2, FACE_CANVAS_WIDTH * 0.9, tone);
  return sig;
}

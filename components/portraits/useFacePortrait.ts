import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { getPortraitAsset, type PortraitAsset } from "@/lib/gen/portraitCatalog";
import { drawPortraitFrame, PORTRAIT_MEASURE_HEIGHT, PORTRAIT_MEASURE_WIDTH, PORTRAIT_MOUTH_CLIP, PORTRAIT_OFFSET_NONE, resolvePortraitBlinkAlignment, type PortraitClip, type PortraitOffset } from "@/lib/render/portraits";

export type FacePortrait = { imageRef: MutableRefObject<HTMLImageElement | null>; loadedIdRef: MutableRefObject<string | null>; offsetsRef: MutableRefObject<{ blink: PortraitOffset; talk: PortraitOffset }>; mouthClipRef: MutableRefObject<PortraitClip>; overlayRef: MutableRefObject<HTMLCanvasElement | null> };

export function useFacePortrait(portraitId: string): FacePortrait {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const loadedIdRef = useRef<string | null>(null);
  const offsetsRef = useRef<{ blink: PortraitOffset; talk: PortraitOffset }>({ blink: PORTRAIT_OFFSET_NONE, talk: PORTRAIT_OFFSET_NONE });
  const mouthClipRef = useRef<PortraitClip>(PORTRAIT_MOUTH_CLIP);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const asset = getPortraitAsset(portraitId);
    if (!asset) { imageRef.current = null; loadedIdRef.current = null; offsetsRef.current = { blink: PORTRAIT_OFFSET_NONE, talk: PORTRAIT_OFFSET_NONE }; mouthClipRef.current = PORTRAIT_MOUTH_CLIP; return; }
    if (loadedIdRef.current === portraitId && imageRef.current?.complete) return;
    let active = true;
    const image = new Image();
    image.decoding = "async";
    const show = () => { if (!active) return; imageRef.current = image; loadedIdRef.current = portraitId; const measured = measureLoadedPortraitOffsets(image, asset); offsetsRef.current = { blink: measured.blink, talk: asset.mouthCalibration.talkOffset }; mouthClipRef.current = asset.mouthCalibration.clip; };
    image.onload = () => { if (typeof image.decode === "function") image.decode().then(show, show); else show(); };
    image.onerror = () => { if (!active) return; if (loadedIdRef.current === portraitId) { imageRef.current = null; loadedIdRef.current = null; offsetsRef.current = { blink: PORTRAIT_OFFSET_NONE, talk: PORTRAIT_OFFSET_NONE }; mouthClipRef.current = PORTRAIT_MOUTH_CLIP; } };
    image.src = asset.src;
    if (image.complete && image.naturalWidth > 0) show();
    return () => { active = false; };
  }, [portraitId]);

  return useMemo(() => ({ imageRef, loadedIdRef, offsetsRef, mouthClipRef, overlayRef }), []);
}

function measureLoadedPortraitOffsets(image: HTMLImageElement, asset: PortraitAsset) {
  const fallback = { blink: PORTRAIT_OFFSET_NONE };
  if (asset.frameCount < 2) return fallback;
  const canvas = document.createElement("canvas");
  canvas.width = PORTRAIT_MEASURE_WIDTH;
  canvas.height = PORTRAIT_MEASURE_HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback;
  const sample = (frame: number) => { ctx.clearRect(0, 0, PORTRAIT_MEASURE_WIDTH, PORTRAIT_MEASURE_HEIGHT); drawPortraitFrame(ctx, image, asset, frame, 0, 0, PORTRAIT_MEASURE_WIDTH, PORTRAIT_MEASURE_HEIGHT); return ctx.getImageData(0, 0, PORTRAIT_MEASURE_WIDTH, PORTRAIT_MEASURE_HEIGHT).data; };
  return { blink: resolvePortraitBlinkAlignment(sample(0), sample(1), PORTRAIT_MEASURE_WIDTH, PORTRAIT_MEASURE_HEIGHT) };
}

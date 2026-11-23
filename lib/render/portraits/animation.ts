import { nextPortraitRandom, portraitHash } from "./types";

export function portraitBlinking(time: number, portraitId: string): boolean {
  const hash = portraitHash(portraitId);
  const interval = 150 + (hash % 180);
  const phase = (hash >>> 8) % interval;
  const position = (Math.floor(time) + phase) % interval;
  return position < 9;
}

export function portraitSpeechFrame(time: number, portraitId: string, frameCount: number): number {
  if (frameCount <= 1) return 0;

  const targetChunk = Math.max(0, Math.floor(time / 5));
  let cursor = 0;
  let mouthOpen = false;
  let random = portraitHash(`${portraitId}:speech`);

  for (let segment = 0; segment < 2048; segment += 1) {
    random = nextPortraitRandom(random);
    const duration = mouthOpen ? 3 + (random % 3) : 2 + (random % 3);
    if (targetChunk < cursor + duration) return mouthOpen ? 2 : 0;
    cursor += duration;
    mouthOpen = !mouthOpen;
  }

  return mouthOpen ? 2 : 0;
}

export function portraitFrameIndex(
  time: number,
  talking: boolean,
  frameCount: number,
  portraitId = "default",
): number {
  if (frameCount <= 1) return 0;
  if (talking && frameCount >= 3) {
    return portraitSpeechFrame(time, portraitId, frameCount);
  }
  if (frameCount >= 2 && portraitBlinking(time, portraitId)) return 1;
  return 0;
}

import type { PortraitMouthCalibration } from "./portraitCalibration";

// Keep only intentional hand-tuned exceptions here. Generated values for every
// shipped asset live in portraitCalibration.generated.ts and are refreshed by
// `pnpm calibrate-portraits --write`.
const calibration = (
  cy: number,
  options: Partial<PortraitMouthCalibration["clip"] & PortraitMouthCalibration["talkOffset"]> = {},
): PortraitMouthCalibration => ({
  clip: {
    cx: options.cx ?? 0.5,
    cy,
    rx: options.rx ?? 0.18,
    ry: options.ry ?? 0.09,
  },
  talkOffset: {
    dx: options.dx ?? 0,
    dy: options.dy ?? 0,
  },
});

export const PORTRAIT_MOUTH_CALIBRATION_OVERRIDES: Readonly<Record<string, PortraitMouthCalibration>> = {
  "commander-01": calibration(0.66, { rx: 0.2, ry: 0.095, dx: 9 }),
  "commander-02": calibration(0.57, { rx: 0.17, ry: 0.085 }),
  "commander-03": calibration(0.55, { rx: 0.18, ry: 0.085 }),
  "commander-04": calibration(0.55, { rx: 0.18, ry: 0.09 }),
  "commander-05": calibration(0.56, { rx: 0.18, ry: 0.085 }),
  "commander-06": calibration(0.55, { rx: 0.18, ry: 0.09 }),
  "commander-07": calibration(0.57, { rx: 0.18, ry: 0.09 }),
  "commander-08": calibration(0.55, { rx: 0.17, ry: 0.085 }),
  "commander-09": calibration(0.55, { rx: 0.18, ry: 0.085 }),
  "commander-10": calibration(0.56, { rx: 0.18, ry: 0.09 }),
  "commander-11": calibration(0.56, { rx: 0.19, ry: 0.095 }),
  // The viseme and collar both produce strong difference bands; keep the
  // reviewed mouth center instead of the detector's lower false positive.
  "enemy-leader-07": calibration(0.79, { cx: 0.513524, rx: 0.18, ry: 0.09 }),
};

"use client";

import { memo } from "react";
import type { FaceTone } from "@/lib/render/portraits";
import type { Character } from "@/lib/types";
import { FaceCanvas } from "@/components/portraits/FaceCanvas";
import { useFacePortrait } from "@/components/portraits/useFacePortrait";

export const Face = memo(function Face({ who, talking, tone }: { who: Character; talking: boolean; tone: FaceTone }) {
  "use no memo";
  const portrait = useFacePortrait(who.face.portraitId);
  return <FaceCanvas who={who} talking={talking} tone={tone} portrait={portrait} />;
});

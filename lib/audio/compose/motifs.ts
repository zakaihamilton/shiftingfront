import type { Rng } from "../../seed/rng";
import { pickDifferent } from "./helpers";
import { type MusicMotif, SIGNATURE_CONTOURS, SIGNATURE_RHYTHMS } from "./types";

export function motifFrom(
  rng: Rng,
  contours: readonly (readonly (number | null)[])[],
  rhythms: readonly number[][],
  avoid?: MusicMotif,
): MusicMotif {
  const availableContours = avoid
    ? contours.filter((candidate) => JSON.stringify(candidate) !== JSON.stringify(avoid.degrees))
    : contours;
  const contour = rng.pick(availableContours.length > 0 ? availableContours : contours);
  const response = pickDifferent(rng, contours, contour);
  const rhythm = rng.pick(rhythms);
  const accents = rng.pick([
    [0, 2],
    [0, 3],
    [1, 4],
  ]);
  return {
    degrees: [...contour],
    response: [...response],
    rhythm: [...rhythm],
    accentSteps: [...accents],
  };
}

function nudgeResponse(degrees: readonly (number | null)[]): (number | null)[] {
  const response = [...degrees];
  const index = response.findIndex(
    (degree, position) => degree !== null && position > 0 && position < response.length - 1,
  );
  if (index < 0) return response;
  const degree = response[index]!;
  response[index] = degree < 4 ? degree + 1 : degree - 1;
  return response;
}

export function motifFromPhrases(
  rng: Rng,
  phrases: readonly { degrees: readonly (number | null)[]; rhythm: readonly number[] }[],
  avoid?: MusicMotif,
): MusicMotif {
  const available = avoid
    ? phrases.filter((phrase) => JSON.stringify(phrase.degrees) !== JSON.stringify(avoid.degrees))
    : phrases;
  const call = rng.pick(available.length > 0 ? available : phrases);
  const alternates = phrases.filter(
    (phrase) =>
      phrase.degrees.length === call.degrees.length &&
      JSON.stringify(phrase.degrees) !== JSON.stringify(call.degrees),
  );
  const response =
    alternates.length > 0 ? [...rng.pick(alternates).degrees] : nudgeResponse(call.degrees);
  return {
    degrees: [...call.degrees],
    response,
    rhythm: [...call.rhythm],
    accentSteps: [
      ...rng.pick([
        [0, 2],
        [0, 3],
        [1, 4],
      ] as const),
    ],
  };
}

export function transposeMotif(motif: MusicMotif, degreeOffset: number): MusicMotif {
  const transpose = (degrees: readonly (number | null)[]) =>
    degrees.map((degree) => (degree === null ? null : degree + degreeOffset));
  return {
    degrees: transpose(motif.degrees),
    response: transpose(motif.response),
    rhythm: [...motif.rhythm],
    accentSteps: [...motif.accentSteps],
  };
}

export function signatureMotifFrom(rng: Rng): MusicMotif {
  return motifFrom(rng, SIGNATURE_CONTOURS, SIGNATURE_RHYTHMS);
}

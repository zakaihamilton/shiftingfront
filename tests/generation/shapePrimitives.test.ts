import { describe, expect, it } from "vitest";
import { irregularIso } from "../../lib/gen/shapePrimitives";
import { irregularIso as tileSpriteIrregularIso } from "../../lib/gen/tileSprites/constants";

describe("tile sprite shape helpers", () => {
  it("preserves the legacy seed-only irregularIso call", () => {
    expect(tileSpriteIrregularIso(0, 0, 20, 10, 999)).toEqual(irregularIso(0, 0, 20, 10, 1));
    expect(tileSpriteIrregularIso(0, 0, 20, 10, 999, 3)).toEqual(irregularIso(0, 0, 20, 10, 3));
  });
});

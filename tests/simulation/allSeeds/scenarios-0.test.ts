import { describe, it } from "vitest";
import { assertScenarioTargets, EXHAUSTIVE_TEST_TIMEOUT, IS_COVERAGE } from "./helpers";

describe("representative scenario partition 0", () => {
  it.skipIf(IS_COVERAGE)(
    "covers representative samples 0-255",
    () => assertScenarioTargets(0, 256),
    EXHAUSTIVE_TEST_TIMEOUT,
  );
});

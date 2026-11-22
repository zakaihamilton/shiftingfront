import { describe, it } from "vitest";
import { assertScenarioTargets, EXHAUSTIVE_TEST_TIMEOUT, IS_COVERAGE } from "./helpers";

describe("representative scenario partition 3", () => {
  it.skipIf(IS_COVERAGE)(
    "covers representative samples 768-1024",
    () => assertScenarioTargets(768, 1_024),
    EXHAUSTIVE_TEST_TIMEOUT,
  );
});

import { describe, it } from "vitest";
import { assertScenarioTargets, EXHAUSTIVE_TEST_TIMEOUT, IS_COVERAGE } from "./helpers";

describe("representative scenario partition 2", () => {
  it.skipIf(IS_COVERAGE)(
    "covers representative samples 512-767",
    () => assertScenarioTargets(512, 768),
    EXHAUSTIVE_TEST_TIMEOUT,
  );
});

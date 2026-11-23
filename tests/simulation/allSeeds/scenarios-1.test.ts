import { describe, it } from "vitest";
import { assertScenarioTargets, EXHAUSTIVE_TEST_TIMEOUT, IS_COVERAGE } from "./helpers";

describe("representative scenario partition 1", () => {
  it.skipIf(IS_COVERAGE)(
    "covers representative samples 256-511",
    () => assertScenarioTargets(256, 512),
    EXHAUSTIVE_TEST_TIMEOUT,
  );
});

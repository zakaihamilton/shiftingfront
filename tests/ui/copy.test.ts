import { describe, expect, it } from "vitest";
import { commandRejectionMessage, formationLabel, lossReasonLabel, saveResultLabel, stanceLabel } from "../../lib/ui/copy";

describe("player-facing copy helpers", () => {
  it("maps command rejection keys to complete sentences", () => {
    expect(commandRejectionMessage("target out of range")).toBe("The target is out of range.");
    expect(commandRejectionMessage("insufficient credits")).toBe("Not enough credits.");
    expect(commandRejectionMessage("producer unavailable")).toBe("You need the required building first.");
    expect(commandRejectionMessage("training step: move")).toBe("Finish the movement training step first.");
    expect(commandRejectionMessage("unknown")).toBe("That order couldn't be completed.");
  });

  it("maps loss reasons without leaking internal keys", () => {
    expect(lossReasonLabel("deadline")).toBe("Time ran out.");
    expect(lossReasonLabel("yardDestroyed")).toBe("The Command HQ was destroyed.");
    expect(lossReasonLabel("objectiveTargetLost")).toBe("The convoy was lost.");
    expect(lossReasonLabel("objectiveTargetLost", "extraction")).toBe("The cargo was lost.");
    expect(lossReasonLabel("objectiveTargetLost", "rescue")).toBe("A stranded unit was lost.");
    expect(lossReasonLabel()).toBe("Mission failed.");
  });

  it("maps save results and stance labels for players", () => {
    expect(saveResultLabel("playing")).toBe("In progress");
    expect(saveResultLabel("won")).toBe("Complete");
    expect(saveResultLabel("lost")).toBe("Failed");
    expect(stanceLabel("defensive")).toBe("Defend");
    expect(formationLabel("wedge")).toBe("Wedge");
  });
});

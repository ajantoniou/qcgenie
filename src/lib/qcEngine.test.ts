import { describe, expect, it } from "vitest";
import { buildQcRun, filterGroundedOmniFlags } from "./qcEngine";

describe("qcEngine", () => {
  it("blocks a run when deterministic gates find ship-stopping defects", () => {
    const run = buildQcRun({
      title: "Episode 2 master",
      minutes: 42,
      deterministicFlags: [
        { gate: "freeze", severity: "block", timestamp: "00:18:04", summary: "Held frame detected for 5.4s" }
      ],
      omniFlags: []
    });

    expect(run.verdict).toBe("BLOCK");
    expect(run.blockingFlagCount).toBe(1);
  });

  it("does not let ungrounded Omni notes create hard failures", () => {
    const grounded = filterGroundedOmniFlags(
      [
        { gate: "omni", severity: "block", timestamp: "00:02:15", summary: "Salem Witch Trials mismatch", transcriptEvidence: "Salem Witch Trials" },
        { gate: "omni", severity: "warn", timestamp: "00:05:20", summary: "Visual pacing may drift from narration", transcriptEvidence: "the city gate" }
      ],
      "The narration describes the city gate and the elders gathered there."
    );

    expect(grounded).toHaveLength(1);
    expect(grounded[0].summary).toContain("Visual pacing");
  });

  it("passes clean deterministic gates even when Omni has only grounded advisory notes", () => {
    const run = buildQcRun({
      title: "Short 04",
      minutes: 0.8,
      deterministicFlags: [],
      omniFlags: [
        { gate: "omni", severity: "warn", timestamp: "00:00:22", summary: "Caption timing is tight", transcriptEvidence: "look at the evidence" }
      ],
      transcript: "Now look at the evidence before the reveal."
    });

    expect(run.verdict).toBe("WATCH");
    expect(run.omniFlagCount).toBe(1);
  });

  it("only returns PASS when there are no deterministic or grounded advisory flags", () => {
    const run = buildQcRun({
      title: "Clean creator upload",
      minutes: 12,
      deterministicFlags: [],
      omniFlags: []
    });

    expect(run.verdict).toBe("PASS");
  });
});

import { describe, expect, it } from "vitest";
import { formatPhaseAlertMessage } from "./phase-labels";

describe("formatPhaseAlertMessage", () => {
  it("describes completed and next phases", () => {
    expect(formatPhaseAlertMessage("focus", "short_rest")).toBe(
      "Focus complete. Up next: Short rest.",
    );
    expect(formatPhaseAlertMessage("long_rest", "focus")).toBe(
      "Long rest complete. Up next: Focus.",
    );
  });
});

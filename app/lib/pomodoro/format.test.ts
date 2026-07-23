import { describe, expect, it } from "vitest";
import { formatPomodoroCountdown } from "./format";

describe("formatPomodoroCountdown", () => {
  it("formats zero as 00:00", () => {
    expect(formatPomodoroCountdown(0)).toBe("00:00");
  });

  it("formats minutes and seconds with padding", () => {
    expect(formatPomodoroCountdown(65)).toBe("01:05");
    expect(formatPomodoroCountdown(25 * 60)).toBe("25:00");
  });

  it("clamps negative and non-finite values to 00:00", () => {
    expect(formatPomodoroCountdown(-5)).toBe("00:00");
    expect(formatPomodoroCountdown(Number.NaN)).toBe("00:00");
  });
});

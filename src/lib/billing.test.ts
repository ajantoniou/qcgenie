import { describe, expect, it } from "vitest";
import { PLANS, calculateUsage } from "./billing";

describe("billing", () => {
  it("meters customer usage by rounded video minutes", () => {
    const usage = calculateUsage(PLANS.creator, [42.2, 0.8, 7.01]);

    expect(usage.minutesUsed).toBe(51);
    expect(usage.minutesRemaining).toBe(1149);
    expect(usage.percentUsed).toBe(5);
  });

  it("marks overage risk before a plan is fully exhausted", () => {
    const usage = calculateUsage(PLANS.studio, [4600, 151]);

    expect(usage.status).toBe("overage-risk");
    expect(usage.minutesRemaining).toBe(249);
  });

  it("keeps UI plan ids aligned with public checkout plan ids", () => {
    expect(PLANS.creator).toMatchObject({
      id: "creator",
      name: "Creator",
      checkoutLabel: "Start Creator"
    });
    expect(PLANS.studio).toMatchObject({
      id: "studio",
      name: "Studio",
      checkoutLabel: "Upgrade Studio"
    });
  });
});

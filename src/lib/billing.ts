export type PlanId = "studio" | "growth";
export type UsageStatus = "healthy" | "overage-risk" | "exhausted";

export interface Plan {
  id: PlanId;
  name: string;
  monthlyPrice: number;
  monthlyMinutes: number;
  checkoutLabel: string;
}

export const PLANS: Record<PlanId, Plan> = {
  studio: {
    id: "studio",
    name: "Creator",
    monthlyPrice: 99,
    monthlyMinutes: 1200,
    checkoutLabel: "Start Creator"
  },
  growth: {
    id: "growth",
    name: "Studio",
    monthlyPrice: 299,
    monthlyMinutes: 5000,
    checkoutLabel: "Upgrade Studio"
  }
};

export interface UsageSummary {
  minutesUsed: number;
  minutesRemaining: number;
  percentUsed: number;
  status: UsageStatus;
}

export function calculateUsage(plan: Plan, jobMinutes: number[]): UsageSummary {
  const rawMinutesUsed = jobMinutes.reduce((sum, minutes) => sum + minutes, 0);
  const minutesUsed = Math.ceil(rawMinutesUsed);
  const minutesRemaining = Math.max(plan.monthlyMinutes - minutesUsed, 0);
  const percentUsed = Math.ceil((minutesUsed / plan.monthlyMinutes) * 100);
  const status = minutesRemaining === 0 ? "exhausted" : percentUsed >= 95 ? "overage-risk" : "healthy";

  return {
    minutesUsed,
    minutesRemaining,
    percentUsed,
    status
  };
}

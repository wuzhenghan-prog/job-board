import type { Opportunity } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DashboardSignals = {
  topAbilities: string[];
  categoryCount: number;
  dueSoonCount: number;
  hasData: boolean;
};

export function computeDashboardSignals(
  opportunities: Opportunity[],
  now = new Date()
): DashboardSignals {
  if (opportunities.length === 0) {
    return {
      topAbilities: [],
      categoryCount: 0,
      dueSoonCount: 0,
      hasData: false
    };
  }

  const abilityStats = new Map<string, { count: number; firstSeen: number }>();
  let firstSeenIndex = 0;
  for (const opportunity of opportunities) {
    for (const ability of opportunity.abilities.hard) {
      const normalized = ability.trim();
      if (!normalized) continue;
      const previous = abilityStats.get(normalized);
      if (previous) {
        previous.count += 1;
      } else {
        abilityStats.set(normalized, { count: 1, firstSeen: firstSeenIndex });
      }
      firstSeenIndex += 1;
    }
  }

  const topAbilities = [...abilityStats.entries()]
    .sort((left, right) => {
      const countDifference = right[1].count - left[1].count;
      return countDifference !== 0
        ? countDifference
        : left[1].firstSeen - right[1].firstSeen;
    })
    .slice(0, 3)
    .map(([ability]) => ability);

  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const endOfWindow = startOfToday + 15 * DAY_MS - 1;
  const dueSoonCount = opportunities.filter((opportunity) => {
    if (opportunity.stage === "closed" || !opportunity.deadline) return false;
    const deadlineTime = new Date(opportunity.deadline).getTime();
    return (
      Number.isFinite(deadlineTime) &&
      deadlineTime >= startOfToday &&
      deadlineTime <= endOfWindow
    );
  }).length;

  return {
    topAbilities,
    categoryCount: new Set(
      opportunities.map((opportunity) => opportunity.categoryId)
    ).size,
    dueSoonCount,
    hasData: true
  };
}

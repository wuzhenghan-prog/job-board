import { describe, expect, it } from "vitest";

import { computeDashboardSignals } from "../src/dashboardSignals";
import type { Opportunity } from "../src/types";

function opportunity(
  id: string,
  overrides: Partial<Opportunity> = {}
): Opportunity {
  return {
    id,
    company: "示例科技",
    title: `岗位 ${id}`,
    location: "成都",
    categoryId: "product",
    categoryName: "产品",
    stage: "to_evaluate",
    responsibilities: [],
    requirements: [],
    abilities: { hard: [], general: [], experience: [] },
    match: { level: "medium", strengths: [], gaps: [], evidence: [] },
    deadline: null,
    sourceUrl: null,
    notes: null,
    version: 1,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    images: [],
    interviewRounds: [],
    statusHistory: [],
    ...overrides
  };
}

describe("dashboard signals", () => {
  it("returns the three most frequent hard abilities and category coverage", () => {
    const signals = computeDashboardSignals(
      [
        opportunity("1", {
          categoryId: "product",
          abilities: { hard: ["数据分析", "产品规划"], general: [], experience: [] }
        }),
        opportunity("2", {
          categoryId: "operations",
          abilities: { hard: ["数据分析", "流程优化"], general: [], experience: [] }
        }),
        opportunity("3", {
          categoryId: "operations",
          abilities: { hard: ["数据分析", "项目推进"], general: [], experience: [] }
        }),
        opportunity("4", {
          categoryId: "research",
          abilities: { hard: ["项目推进", "半导体"], general: [], experience: [] }
        })
      ],
      new Date("2026-11-12T09:00:00.000Z")
    );

    expect(signals.topAbilities).toEqual(["数据分析", "项目推进", "产品规划"]);
    expect(signals.categoryCount).toBe(3);
    expect(signals.dueSoonCount).toBe(0);
  });

  it("counts deadlines within fourteen days and ignores closed or invalid dates", () => {
    const now = new Date("2026-11-12T09:00:00.000Z");
    const signals = computeDashboardSignals(
      [
        opportunity("1", { deadline: "2026-11-12T00:00:00.000Z" }),
        opportunity("2", { deadline: "2026-11-26T23:59:00.000Z" }),
        opportunity("3", { deadline: "2026-11-27T00:00:01.000Z" }),
        opportunity("4", { deadline: "2026-11-15T00:00:00.000Z", stage: "closed" }),
        opportunity("5", { deadline: "not-a-date" })
      ],
      now
    );

    expect(signals.dueSoonCount).toBe(2);
  });

  it("returns a descriptive empty state instead of placeholder abilities", () => {
    const signals = computeDashboardSignals([], new Date("2026-11-12T09:00:00.000Z"));
    expect(signals).toEqual({
      topAbilities: [],
      categoryCount: 0,
      dueSoonCount: 0,
      hasData: false
    });
  });
});

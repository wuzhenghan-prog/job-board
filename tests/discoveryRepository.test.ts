import { describe, expect, it } from "vitest";

import {
  addRecommendations,
  canStartManualDiscovery,
  createDiscoveryRun,
  getDiscoveryOverview,
  getDiscoveryPreferences,
  listRecommendations,
  pruneDiscoveryRecommendations,
  saveDiscoveryPreferences,
  updateRecommendationState
} from "../src/worker/discoveryRepository";
import { createFakeD1 } from "./helpers/fakeD1";

const now = new Date("2026-11-15T00:00:00.000Z");

function recommendation(index: number, overrides: Record<string, unknown> = {}) {
  return {
    sourceUrl: `https://jobs.example.com/role/${index}?utm_source=test`,
    canonicalUrl: `https://jobs.example.com/role/${index}`,
    sourceDomain: "jobs.example.com",
    sourceTitle: `岗位 ${index}`,
    snippet: "公开岗位摘要",
    fingerprint: `company-${index}|role-${index}|成都`,
    title: `产品经理 ${index}`,
    company: `公司 ${index}`,
    location: "成都",
    salary: "15-20K",
    salaryMinK: 15,
    salaryMaxK: 20,
    salaryKnown: true,
    categoryName: "产品",
    responsibilities: ["需求分析"],
    requirements: ["本科"],
    abilities: { hard: ["数据分析"], general: ["沟通"], experience: [] },
    match: {
      level: "high" as const,
      score: 90 - index,
      strengths: ["数据分析"],
      gaps: [],
      evidence: ["能力档案包含数据分析"]
    },
    missingFields: [],
    sourcePostedAt: null,
    sourceValidThrough: null,
    ...overrides
  };
}

describe("discovery repository", () => {
  it("returns disabled empty preferences and persists configured preferences", async () => {
    const DB = createFakeD1();
    expect(await getDiscoveryPreferences(DB)).toMatchObject({
      targetTitles: [],
      enabled: false
    });
    const saved = await saveDiscoveryPreferences(
      DB,
      {
        targetTitles: ["产品经理"],
        categoryIds: ["product"],
        locations: ["成都"],
        remoteAllowed: true,
        salaryFloorK: 15,
        experienceLevel: "实习/初级",
        includeKeywords: ["AI"],
        excludeKeywords: ["销售"],
        enabled: true
      },
      now
    );
    expect(saved).toMatchObject({
      targetTitles: ["产品经理"],
      categoryNames: ["产品"],
      enabled: true
    });
  });

  it("limits manual runs to three per day and thirty-minute spacing", async () => {
    const DB = createFakeD1();
    await saveDiscoveryPreferences(
      DB,
      {
        targetTitles: ["产品经理"],
        categoryIds: ["product"],
        locations: ["成都"],
        remoteAllowed: false,
        salaryFloorK: null,
        experienceLevel: "",
        includeKeywords: [],
        excludeKeywords: [],
        enabled: true
      },
      now
    );
    await createDiscoveryRun(DB, "manual", now);
    expect(await canStartManualDiscovery(DB, new Date(now.getTime() + 31 * 60_000))).toMatchObject({
      allowed: true
    });
    expect(await canStartManualDiscovery(DB, new Date(now.getTime() + 10 * 60_000))).toMatchObject({
      allowed: false
    });
  });

  it("deduplicates recommendations by canonical URL and fingerprint", async () => {
    const DB = createFakeD1();
    const run = await createDiscoveryRun(DB, "manual", now);
    const inserted = await addRecommendations(DB, run.id, [recommendation(1), recommendation(1)], now);
    expect(inserted).toBe(1);
    const updated = await addRecommendations(DB, run.id, [recommendation(1, { sourceUrl: "https://other.example.com/job" })], now);
    expect(updated).toBe(0);
    expect(await listRecommendations(DB)).toHaveLength(1);
  });

  it("removes expired records and caps active recommendations at two hundred", async () => {
    const DB = createFakeD1();
    const run = await createDiscoveryRun(DB, "manual", now);
    await addRecommendations(
      DB,
      run.id,
      Array.from({ length: 205 }, (_, index) => recommendation(index)),
      now
    );
    const first = (await listRecommendations(DB))[0];
    await updateRecommendationState(DB, first.id, "ignored", now);
    await pruneDiscoveryRecommendations(DB, new Date(now.getTime() + 31 * 24 * 60 * 60_000));
    expect(await listRecommendations(DB)).toHaveLength(0);

    await addRecommendations(
      DB,
      run.id,
      Array.from({ length: 205 }, (_, index) => recommendation(index + 300)),
      now
    );
    await pruneDiscoveryRecommendations(DB, now);
    expect(await listRecommendations(DB)).toHaveLength(200);
  });

  it("reports latest run, counts and new recommendations", async () => {
    const DB = createFakeD1();
    const run = await createDiscoveryRun(DB, "scheduled", now);
    await addRecommendations(DB, run.id, [recommendation(1)], now);
    const overview = await getDiscoveryOverview(DB, now);
    expect(overview.lastRun).toMatchObject({
      id: run.id,
      triggerType: "scheduled",
      candidateCount: 0,
      hardFilteredCount: 0,
      modelExcludedCount: 0
    });
    expect(overview.recommendations).toHaveLength(1);
  });
});

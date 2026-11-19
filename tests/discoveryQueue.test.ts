import { describe, expect, it, vi } from "vitest";

import {
  processDiscoveryRun,
  triggerScheduledDiscovery
} from "../src/worker/discoveryQueue";
import {
  createDiscoveryRun,
  getDiscoveryOverview,
  saveDiscoveryPreferences
} from "../src/worker/discoveryRepository";
import { createAuthenticatedTestEnv } from "./helpers/api";

const preferences = {
  targetTitles: ["数据产品"],
  categoryIds: ["product"],
  locations: ["成都"],
  remoteAllowed: false,
  salaryFloorK: 15,
  experienceLevel: "实习/初级",
  includeKeywords: ["AI"],
  excludeKeywords: ["销售"],
  enabled: true
};

const page = {
  sourceUrl: "https://jobs.example.com/product",
  canonicalUrl: "https://jobs.example.com/product",
  sourceDomain: "jobs.example.com",
  sourceTitle: "数据产品实习生",
  snippet: "AI 数据产品",
  title: "数据产品实习生",
  company: "星河科技",
  location: "成都",
  salary: "15-20K",
  description: "负责 AI 数据产品需求分析和指标设计",
  postedAt: null,
  validThrough: "2026-12-31"
};

describe("discovery queue", () => {
  it("does not schedule when auto discovery is disabled", async () => {
    const { env, discoveryMessages } = await createAuthenticatedTestEnv();
    expect(
      await triggerScheduledDiscovery(env, new Date("2026-11-15T00:00:00.000Z"))
    ).toBeNull();
    expect(discoveryMessages).toEqual([]);
  });

  it("creates only one scheduled run per China day", async () => {
    const { env, discoveryMessages } = await createAuthenticatedTestEnv();
    await saveDiscoveryPreferences(env.DB, preferences);
    const first = await triggerScheduledDiscovery(
      env,
      new Date("2026-11-15T00:00:00.000Z")
    );
    const second = await triggerScheduledDiscovery(
      env,
      new Date("2026-11-15T02:00:00.000Z")
    );
    expect(first?.triggerType).toBe("scheduled");
    expect(second).toBeNull();
    expect(discoveryMessages).toEqual([first?.id]);
  });

  it("processes a run once and writes recommendations without formal jobs", async () => {
    const { env } = await createAuthenticatedTestEnv();
    await saveDiscoveryPreferences(env.DB, preferences);
    const run = await createDiscoveryRun(env.DB, "manual");
    const pagesLoader = vi.fn(async () => [page]);
    const model = vi.fn(async () => ({
      recommendations: [
        {
          candidateId: "candidate-1",
          isJob: true,
          title: "数据产品实习生",
          company: "星河科技",
          location: "成都",
          salary: "15-20K",
          remote: false,
          categoryName: "产品",
          responsibilities: ["需求分析"],
          requirements: ["本科"],
          abilities: { hard: ["数据分析"], general: ["沟通"], experience: [] },
          match: {
            level: "high" as const,
            score: 88,
            strengths: ["数据分析"],
            gaps: ["产品案例"],
            evidence: ["能力档案包含数据分析"]
          },
          missingFields: []
        }
      ]
    }));
    const result = await processDiscoveryRun(env, run.id, {
      now: new Date("2026-11-15T00:00:00.000Z"),
      pagesLoader,
      model
    });
    expect(result).toMatchObject({
      candidateCount: 1,
      hardFilteredCount: 1,
      modelExcludedCount: 0,
      recommendationCount: 1
    });
    expect(pagesLoader).toHaveBeenCalledTimes(1);
    expect(model).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM opportunities").first()
    ).toEqual({ count: 0 });
    expect((await getDiscoveryOverview(env.DB)).recommendations).toHaveLength(1);
  });

  it("keeps automatic runs idempotent after completion", async () => {
    const { env } = await createAuthenticatedTestEnv();
    await saveDiscoveryPreferences(env.DB, preferences);
    const run = await createDiscoveryRun(env.DB, "manual");
    await env.DB.prepare(
      "UPDATE job_discovery_runs SET status = 'completed', completed_at = ? WHERE id = ?"
    ).bind(new Date().toISOString(), run.id).run();
    const pagesLoader = vi.fn();
    const result = await processDiscoveryRun(env, run.id, {
      pagesLoader,
      model: vi.fn()
    });
    expect(result).toBeNull();
    expect(pagesLoader).not.toHaveBeenCalled();
  });
});

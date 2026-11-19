import { describe, expect, it } from "vitest";

import worker from "../src/worker/app";
import { addRecommendations, createDiscoveryRun } from "../src/worker/discoveryRepository";
import { createAuthenticatedTestEnv } from "./helpers/api";

const preferences = {
  targetTitles: ["产品经理"],
  categoryIds: ["product"],
  locations: ["成都"],
  remoteAllowed: true,
  salaryFloorK: 15,
  experienceLevel: "实习/初级",
  includeKeywords: ["AI"],
  excludeKeywords: ["销售"],
  enabled: true
};

async function json<T>(response: Response): Promise<T> {
  expect(response.ok).toBe(true);
  return (await response.json()) as T;
}

function draft(index = 1) {
  return {
    sourceUrl: `https://jobs.example.com/${index}`,
    canonicalUrl: `https://jobs.example.com/${index}`,
    sourceDomain: "jobs.example.com",
    sourceTitle: `数据产品实习生 ${index}`,
    snippet: "AI 数据产品岗位",
    fingerprint: `星河科技|数据产品实习生${index}|成都`,
    title: `数据产品实习生 ${index}`,
    company: "星河科技",
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
      score: 88,
      strengths: ["数据分析"],
      gaps: ["产品案例"],
      evidence: ["能力档案包含数据分析"]
    },
    missingFields: [],
    sourcePostedAt: null,
    sourceValidThrough: null
  };
}

describe("discovery API", () => {
  it("requires login", async () => {
    const { env } = await createAuthenticatedTestEnv();
    expect((await worker.request("/api/discovery", {}, env)).status).toBe(401);
  });

  it("saves preferences and creates a manual queued run without writing jobs", async () => {
    const { env, cookie, discoveryMessages } = await createAuthenticatedTestEnv();
    const saved = await json<{ enabled: boolean; categoryNames: string[] }>(
      await worker.request(
        "/api/discovery/preferences",
        {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify(preferences)
        },
        env
      )
    );
    expect(saved).toMatchObject({ enabled: true, categoryNames: ["产品"] });

    const run = await json<{ id: string; status: string }>(
      await worker.request(
        "/api/discovery/runs",
        { method: "POST", headers: { cookie } },
        env
      )
    );
    expect(run.status).toBe("queued");
    expect(discoveryMessages).toEqual([run.id]);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM opportunities").first()
    ).toEqual({ count: 0 });
  });

  it("returns the discovery overview and ignores a recommendation", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    await worker.request(
      "/api/discovery/preferences",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(preferences)
      },
      env
    );
    const run = await createDiscoveryRun(env.DB, "manual");
    await addRecommendations(env.DB, run.id, [draft()]);
    const overview = await json<{ recommendations: Array<{ id: string }> }>(
      await worker.request("/api/discovery", { headers: { cookie } }, env)
    );
    expect(overview.recommendations).toHaveLength(1);
    const response = await worker.request(
      `/api/discovery/recommendations/${overview.recommendations[0].id}/ignore`,
      { method: "POST", headers: { cookie } },
      env
    );
    expect(response.status).toBe(204);
  });

  it("creates exactly one formal opportunity when the user confirms a recommendation", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const run = await createDiscoveryRun(env.DB, "manual");
    await addRecommendations(env.DB, run.id, [draft()]);
    const recommendation = await env.DB.prepare(
      "SELECT id FROM job_recommendations LIMIT 1"
    ).first<{ id: string }>();
    const response = await json<{ id: string; salary: string }>(
      await worker.request(
        `/api/discovery/recommendations/${recommendation?.id}/save`,
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({
            title: "数据产品实习生 1",
            company: "星河科技",
            location: "成都",
            salary: "15-20K",
            categoryId: "product",
            stage: "to_evaluate",
            responsibilities: ["需求分析"],
            requirements: ["本科"],
            abilities: { hard: ["数据分析"], general: ["沟通"], experience: [] },
            match: {
              level: "high",
              strengths: ["数据分析"],
              gaps: ["产品案例"],
              evidence: ["能力档案包含数据分析"]
            },
            deadline: null,
            sourceUrl: "https://jobs.example.com/1",
            notes: "来自自动岗位发现"
          })
        },
        env
      )
    );
    expect(response.salary).toBe("15-20K");
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM opportunities").first()
    ).toEqual({ count: 1 });
    expect(
      await env.DB.prepare(
        "SELECT state, saved_opportunity_id FROM job_recommendations WHERE id = ?"
      ).bind(recommendation?.id).first()
    ).toMatchObject({ state: "saved", saved_opportunity_id: response.id });
  });

  it("rejects a second manual run within thirty minutes", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    await worker.request(
      "/api/discovery/preferences",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(preferences)
      },
      env
    );
    expect(
      (await worker.request("/api/discovery/runs", { method: "POST", headers: { cookie } }, env)).status
    ).toBe(201);
    expect(
      (await worker.request("/api/discovery/runs", { method: "POST", headers: { cookie } }, env)).status
    ).toBe(429);
  });
});

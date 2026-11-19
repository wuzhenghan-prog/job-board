import { describe, expect, it } from "vitest";

import worker from "../src/worker/app";
import { createAuthenticatedTestEnv } from "./helpers/api";

const png1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1Qw1YAAAADUlEQVR42mP8z8DwHwAFeAJ/J9o4AAAAAElFTkSuQmCC";

const extractionResult = {
  title: "AI 数据运营实习生",
  company: "星火科技",
  location: "成都",
  salary: "8-12K·13薪",
  categoryName: "运营",
  responsibilities: ["负责数据标注流程优化"],
  requirements: ["本科及以上在读"],
  abilities: {
    hard: ["数据分析", "流程优化"],
    general: ["跨团队沟通"],
    experience: ["有数据运营经验加分"]
  },
  match: {
    level: "medium",
    strengths: ["项目管理"],
    gaps: ["缺少平台数据经验"],
    evidence: ["负责过跨团队项目"]
  },
  missingFields: []
};

describe("extraction API", () => {
  it("uploads screenshots, stores a job, and confirms an opportunity", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const form = new FormData();
    form.append("images", new Blob([Uint8Array.from(atob(png1x1), c => c.charCodeAt(0))], { type: "image/png" }), "screenshot-1.png");
    form.append("images", new Blob([Uint8Array.from(atob(png1x1), c => c.charCodeAt(0))], { type: "image/png" }), "screenshot-2.png");

    const createJobResponse = await worker.request(
      "/api/extraction-jobs",
      { method: "POST", headers: { cookie }, body: form },
      env
    );
    expect(createJobResponse.status).toBe(201);
    const job = await createJobResponse.json();
    expect(job.status).toBe("queued");
    expect(job.images).toHaveLength(2);

    const getJobResponse = await worker.request(
      `/api/extraction-jobs/${job.id}`,
      { headers: { cookie } },
      env
    );
    expect(getJobResponse.status).toBe(200);
    const fetchedJob = await getJobResponse.json();
    expect(fetchedJob.id).toBe(job.id);
    expect(fetchedJob.status).toBe("queued");
    expect(fetchedJob.images).toHaveLength(2);

    // Simulate a completed model result before confirmation.
    await env.DB.prepare(
      "UPDATE extraction_jobs SET status = 'awaiting_review', result = ? WHERE id = ?"
    )
      .bind(JSON.stringify(extractionResult), job.id)
      .run();

    const confirmResponse = await worker.request(
      `/api/extraction-jobs/${job.id}/confirm`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          categoryId: "operations",
          ...extractionResult
        })
      },
      env
    );
    expect(confirmResponse.status).toBe(201);
    const opportunity = await confirmResponse.json();
    expect(opportunity).toMatchObject({
      title: "AI 数据运营实习生",
      company: "星火科技",
      salary: "8-12K·13薪",
      stage: "to_evaluate",
      match: { level: "medium" }
    });
    expect(opportunity.images).toHaveLength(2);

    const jobAfterConfirm = await worker.request(
      `/api/extraction-jobs/${job.id}`,
      { headers: { cookie } },
      env
    );
    const confirmedJob = await jobAfterConfirm.json();
    expect(confirmedJob.status).toBe("confirmed");
    expect(confirmedJob.opportunityId).toBe(opportunity.id);
  });

  it("rejects confirmation when the job is not awaiting review", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const form = new FormData();
    form.append("images", new Blob([Uint8Array.from(atob(png1x1), c => c.charCodeAt(0))], { type: "image/png" }), "only.png");
    const createJobResponse = await worker.request(
      "/api/extraction-jobs",
      { method: "POST", headers: { cookie }, body: form },
      env
    );
    const job = await createJobResponse.json();

    const confirmResponse = await worker.request(
      `/api/extraction-jobs/${job.id}/confirm`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          categoryId: "other",
          title: "岗位",
          company: null,
          location: null,
          categoryName: "其他",
          responsibilities: [],
          requirements: [],
          abilities: { hard: [], general: [], experience: [] },
          match: { level: "low", strengths: [], gaps: [], evidence: [] },
          missingFields: []
        })
      },
      env
    );
    expect(confirmResponse.status).toBe(409);
  });

  it("requeues a failed job without uploading new screenshots", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const form = new FormData();
    form.append("images", new Blob([Uint8Array.from(atob(png1x1), c => c.charCodeAt(0))], { type: "image/png" }), "retry.png");
    const createJobResponse = await worker.request(
      "/api/extraction-jobs",
      { method: "POST", headers: { cookie }, body: form },
      env
    );
    const job = await createJobResponse.json();
    await env.DB.prepare(
      "UPDATE extraction_jobs SET status = 'failed', error = '测试失败' WHERE id = ?"
    ).bind(job.id).run();

    const retryResponse = await worker.request(
      `/api/extraction-jobs/${job.id}/retry`,
      { method: "POST", headers: { cookie } },
      env
    );
    expect(retryResponse.status).toBe(200);
    expect(await retryResponse.json()).toMatchObject({
      id: job.id,
      status: "queued",
      error: null
    });
  });
});

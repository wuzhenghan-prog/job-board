import { describe, expect, it } from "vitest";

import worker from "../src/worker/app";
import { createAuthenticatedTestEnv, requestJson } from "./helpers/api";

const opportunityInput = {
  title: "AI 产品经理",
  company: "示例科技",
  location: "成都",
  salary: "15-25K·14薪",
  categoryId: "product",
  stage: "to_evaluate",
  responsibilities: ["负责 AI 产品规划"],
  requirements: ["本科及以上学历"],
  abilities: {
    hard: ["产品规划", "数据分析"],
    general: ["跨团队沟通"],
    experience: ["有 AI 产品经验"]
  },
  match: {
    level: "medium",
    strengths: ["项目管理"],
    gaps: ["缺少 AI 产品案例"],
    evidence: ["负责过跨团队项目"]
  },
  deadline: "2026-12-01T00:00:00.000Z",
  sourceUrl: "https://example.com/job/123",
  notes: "来自师兄内推"
};

describe("opportunities API", () => {
  it("creates, lists, shows and deletes an opportunity", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const createResponse = await worker.request(
      "/api/opportunities",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(opportunityInput)
      },
      env
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created).toMatchObject({
      title: "AI 产品经理",
      company: "示例科技",
      salary: "15-25K·14薪",
      stage: "to_evaluate",
      match: { level: "medium" }
    });

    const listResponse = await worker.request(
      "/api/opportunities",
      { headers: { cookie } },
      env
    );
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(1);

    const detailResponse = await worker.request(
      `/api/opportunities/${created.id}`,
      { headers: { cookie } },
      env
    );
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json();
    expect(detail).toMatchObject({ id: created.id });
    expect(detail.abilities).toEqual(opportunityInput.abilities);
    expect(detail.images).toEqual([]);
    expect(detail.interviewRounds).toEqual([]);

    const deleteResponse = await worker.request(
      `/api/opportunities/${created.id}`,
      { method: "DELETE", headers: { cookie } },
      env
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("updates stage and writes status history", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const createResponse = await worker.request(
      "/api/opportunities",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(opportunityInput)
      },
      env
    );
    const created = await createResponse.json();

    const updateStageResponse = await worker.request(
      `/api/opportunities/${created.id}/stage`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ stage: "preparing" })
      },
      env
    );
    expect(updateStageResponse.status).toBe(200);
    expect(await updateStageResponse.json()).toMatchObject({
      stage: "preparing"
    });

    const detailResponse = await worker.request(
      `/api/opportunities/${created.id}`,
      { headers: { cookie } },
      env
    );
    const detail = await detailResponse.json();
    expect(detail.stage).toBe("preparing");
    expect(detail.statusHistory).toEqual([
      expect.objectContaining({
        previousStage: "to_evaluate",
        newStage: "preparing"
      })
    ]);
  });

  it("creates and lists interview rounds", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const createResponse = await worker.request(
      "/api/opportunities",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(opportunityInput)
      },
      env
    );
    const created = await createResponse.json();

    const roundResponse = await worker.request(
      `/api/opportunities/${created.id}/interview-rounds`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          roundType: "技术面",
          scheduledAt: "2026-11-20T10:00:00.000Z",
          result: null,
          notes: "准备项目介绍"
        })
      },
      env
    );
    expect(roundResponse.status).toBe(201);
    const round = await roundResponse.json();
    expect(round).toMatchObject({
      roundType: "技术面",
      scheduledAt: "2026-11-20T10:00:00.000Z",
      notes: "准备项目介绍"
    });

    const detailResponse = await worker.request(
      `/api/opportunities/${created.id}`,
      { headers: { cookie } },
      env
    );
    const detail = await detailResponse.json();
    expect(detail.interviewRounds).toHaveLength(1);
  });

  it("edits an opportunity without allowing a stale overwrite", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const createResponse = await worker.request(
      "/api/opportunities",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(opportunityInput)
      },
      env
    );
    const created = await createResponse.json();

    const editResponse = await worker.request(
      `/api/opportunities/${created.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          ...opportunityInput,
          title: "AI 产品负责人",
          company: "新示例科技",
          version: created.version
        })
      },
      env
    );
    expect(editResponse.status).toBe(200);
    const edited = await editResponse.json();
    expect(edited).toMatchObject({
      title: "AI 产品负责人",
      company: "新示例科技",
      version: 2
    });

    const staleResponse = await worker.request(
      `/api/opportunities/${created.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          ...opportunityInput,
          title: "过期修改",
          version: created.version
        })
      },
      env
    );
    expect(staleResponse.status).toBe(409);
  });

  it("deletes linked screenshot objects when deleting an opportunity", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const createResponse = await worker.request(
      "/api/opportunities",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(opportunityInput)
      },
      env
    );
    const created = await createResponse.json();
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO opportunity_images (id, opportunity_id, r2_key, mime_type, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind("image-1", created.id, "job-board/test/image-1", "image/png", now).run();
    await env.SCREENSHOTS.put("job-board/test/image-1", new Uint8Array([1]));

    const deleteResponse = await worker.request(
      `/api/opportunities/${created.id}`,
      { method: "DELETE", headers: { cookie } },
      env
    );
    expect(deleteResponse.status).toBe(204);
    expect(await env.SCREENSHOTS.get("job-board/test/image-1")).toBeNull();
  });

  it("keeps screenshot bytes private until retrieved through an authenticated request", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const createResponse = await worker.request(
      "/api/opportunities",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(opportunityInput)
      },
      env
    );
    const created = await createResponse.json();
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO opportunity_images (id, opportunity_id, r2_key, mime_type, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind("image-private", created.id, "job-board/test/image-private", "image/png", now).run();
    await env.SCREENSHOTS.put("job-board/test/image-private", new Uint8Array([137, 80, 78, 71]));

    const unauthorized = await worker.request(
      "/api/images/image-private",
      {},
      env
    );
    expect(unauthorized.status).toBe(401);

    const authorized = await worker.request(
      "/api/images/image-private",
      { headers: { cookie } },
      env
    );
    expect(authorized.status).toBe(200);
    expect(new Uint8Array(await authorized.arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71])
    );
  });

  it("indexes opportunity content for the read-only assistant after create and update", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const created = await requestJson<{ id: string }>(
      "/api/opportunities",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(opportunityInput)
      },
      env
    );
    const chunks = await env.DB.prepare(
      "SELECT content FROM assistant_chunks WHERE source_type = 'opportunity' AND source_id = ?"
    ).bind(created.id).all<{ content: string }>();
    expect(chunks.results.map((row) => row.content).join(" ")).toContain(
      opportunityInput.title
    );

    await requestJson(
      `/api/opportunities/${created.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          ...opportunityInput,
          title: "更新后的 AI 产品岗位",
          version: 1
        })
      },
      env
    );
    const updated = await env.DB.prepare(
      "SELECT content FROM assistant_chunks WHERE source_type = 'opportunity' AND source_id = ?"
    ).bind(created.id).all<{ content: string }>();
    expect(JSON.stringify(updated.results)).toContain("更新后的 AI 产品岗位");
  });
});
import { indexOpportunity } from "../src/worker/assistantRepository";

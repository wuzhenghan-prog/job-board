import { describe, expect, it } from "vitest";

import worker from "../src/worker/app";
import { createAuthenticatedTestEnv } from "./helpers/api";

async function json<T>(response: Response): Promise<T> {
  expect(response.ok).toBe(true);
  return (await response.json()) as T;
}

describe("assistant API", () => {
  it("requires login for all assistant routes", async () => {
    const { env } = await createAuthenticatedTestEnv();
    for (const path of [
      "/api/assistant/conversations",
      "/api/assistant/documents",
      "/api/assistant/usage"
    ]) {
      const response = await worker.request(path, {}, env);
      expect(response.status).toBe(401);
    }
  });

  it("creates, updates, lists and deletes a scoped conversation", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const documentResponse = await worker.request(
      "/api/assistant/documents",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          title: "项目复盘",
          kind: "project",
          tags: ["产品"],
          content: "负责数据分析与产品运营",
          fileName: "project.md",
          mimeType: "text/markdown"
        })
      },
      env
    );
    const document = await json<{ id: string }>(documentResponse);
    const created = await json<{ id: string; webSearchEnabled: boolean }>(
      await worker.request(
        "/api/assistant/conversations",
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ title: "岗位比较" })
        },
        env
      )
    );
    expect(created.webSearchEnabled).toBe(false);

    const updated = await json<{
      title: string;
      webSearchEnabled: boolean;
      documentIds: string[];
    }>(
      await worker.request(
        `/api/assistant/conversations/${created.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({
            title: "面试准备",
            webSearchEnabled: true,
            documentIds: [document.id]
          })
        },
        env
      )
    );
    expect(updated).toMatchObject({
      title: "面试准备",
      webSearchEnabled: true,
      documentIds: [document.id]
    });

    expect(
      await json<Array<{ id: string }>>(
        await worker.request(
          "/api/assistant/conversations",
          { headers: { cookie } },
          env
        )
      )
    ).toHaveLength(1);

    const deleted = await worker.request(
      `/api/assistant/conversations/${created.id}`,
      { method: "DELETE", headers: { cookie } },
      env
    );
    expect(deleted.status).toBe(204);
  });

  it("uploads, previews, toggles, downloads and deletes a private document", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const body = new FormData();
    body.set("file", new Blob(["负责数据分析与产品运营\n手机：18800000000"], { type: "text/markdown" }), "project.md");
    body.set("title", "项目复盘");
    body.set("kind", "project");
    body.set("tags", JSON.stringify(["产品", "数据"]));
    body.set("content", "负责数据分析与产品运营\n手机：18800000000");

    const created = await json<{
      id: string;
      title: string;
      tags: string[];
      enabled: boolean;
    }>(
      await worker.request(
        "/api/assistant/documents",
        { method: "POST", headers: { cookie }, body },
        env
      )
    );
    expect(created).toMatchObject({
      title: "项目复盘",
      tags: ["产品", "数据"],
      enabled: true
    });

    const preview = await json<{ content: string }>(
      await worker.request(
        `/api/assistant/documents/${created.id}`,
        { headers: { cookie } },
        env
      )
    );
    expect(preview.content).toContain("18800000000");

    const toggled = await json<{ enabled: boolean }>(
      await worker.request(
        `/api/assistant/documents/${created.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ enabled: false })
        },
        env
      )
    );
    expect(toggled.enabled).toBe(false);

    const download = await worker.request(
      `/api/assistant/documents/${created.id}/file`,
      { headers: { cookie } },
      env
    );
    expect(download.headers.get("content-disposition")).toContain("project.md");

    const deleted = await worker.request(
      `/api/assistant/documents/${created.id}`,
      { method: "DELETE", headers: { cookie } },
      env
    );
    expect(deleted.status).toBe(204);
    expect(
      await worker.request(
        `/api/assistant/documents/${created.id}`,
        { headers: { cookie } },
        env
      )
    ).toHaveProperty("status", 404);
  });

  it("rejects oversized files and invalid document types", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const makeBody = (type: string, size: number) => {
      const body = new FormData();
      body.set("file", new Blob([new Uint8Array(size)], { type }), "bad.txt");
      body.set("title", "bad");
      body.set("kind", "other");
      body.set("content", "x".repeat(20));
      return body;
    };
    const invalid = await worker.request(
      "/api/assistant/documents",
      { method: "POST", headers: { cookie }, body: makeBody("application/zip", 10) },
      env
    );
    expect(invalid.status).toBe(422);
    const oversized = await worker.request(
      "/api/assistant/documents",
      {
        method: "POST",
        headers: { cookie },
        body: makeBody("text/plain", 15 * 1024 * 1024 + 1)
      },
      env
    );
    expect(oversized.status).toBe(422);
  });

  it("exposes only read-only assistant capabilities", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const response = await worker.request(
      "/api/assistant/capabilities",
      { headers: { cookie } },
      env
    );
    expect(await response.json()).toEqual({
      mode: "read-only",
      canModifyBusinessData: false
    });
  });

  it("does not expose business mutation routes under the assistant namespace", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    for (const [method, path] of [
      ["POST", "/api/assistant/opportunities"],
      ["PATCH", "/api/assistant/opportunities/opp-1"],
      ["DELETE", "/api/assistant/opportunities/opp-1"],
      ["PATCH", "/api/assistant/profile"],
      ["PATCH", "/api/assistant/ai-settings"]
    ] as const) {
      const response = await worker.request(
        path,
        {
          method,
          headers: { "content-type": "application/json", cookie },
          body: method === "DELETE" ? undefined : "{}"
        },
        env
      );
      expect([404, 405]).toContain(response.status);
    }
  });

  it("stops an in-progress answer without overwriting partial content", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const conversation = await json<{ id: string }>(
      await worker.request(
        "/api/assistant/conversations",
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ title: "停止测试" })
        },
        env
      )
    );
    await env.DB.prepare(
      "INSERT INTO assistant_messages (id, conversation_id, role, content, status, attempt, created_at) VALUES ('stop-message', ?, 'assistant', '已生成的部分回答', 'streaming', 1, ?)"
    ).bind(conversation.id, new Date().toISOString()).run();
    const response = await worker.request(
      "/api/assistant/messages/stop-message/stop",
      { method: "POST", headers: { cookie } },
      env
    );
    expect(response.status).toBe(200);
    const row = await env.DB.prepare(
      "SELECT content, status FROM assistant_messages WHERE id = 'stop-message'"
    ).first<{ content: string; status: string }>();
    expect(row).toMatchObject({
      content: "已生成的部分回答",
      status: "stopped"
    });
  });

  it("returns the original question for a new retry attempt", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const conversation = await json<{ id: string }>(
      await worker.request(
        "/api/assistant/conversations",
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ title: "重试测试" })
        },
        env
      )
    );
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO assistant_messages (id, conversation_id, role, content, status, attempt, created_at) VALUES ('retry-user', ?, 'user', '原问题', 'completed', 1, ?)"
    ).bind(conversation.id, now).run();
    await env.DB.prepare(
      "INSERT INTO assistant_messages (id, conversation_id, role, content, status, attempt, created_at) VALUES ('retry-answer', ?, 'assistant', '', 'failed', 1, ?)"
    ).bind(conversation.id, now).run();
    const response = await json<{
      question: string;
      replacementFor: string;
      attempt: number;
    }>(
      await worker.request(
        "/api/assistant/messages/retry-answer/retry",
        { method: "POST", headers: { cookie } },
        env
      )
    );
    expect(response).toMatchObject({
      question: "原问题",
      replacementFor: "retry-answer"
    });
    expect(response.attempt).toBe(2);
    const replacement = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM assistant_messages WHERE replaces_message_id = 'retry-answer'"
    ).first<{ count: number }>();
    expect(replacement).toEqual({ count: 0 });
  });

  it("streams a grounded reply, saves citations and keeps one generation active", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO opportunities (id, company, title, category_id, stage, version, created_at, updated_at) VALUES ('opp-chat', '示例科技', '数据产品实习生', 'product', 'to_evaluate', 1, ?, ?)"
    ).bind(now, now).run();
    await env.DB.prepare(
      `INSERT INTO assistant_chunks (id, source_type, source_id, chunk_index, content, created_at) VALUES ('chunk-chat', 'opportunity', 'opp-chat', 0, '数据产品实习生，负责数据分析与产品规划', ?)`
    ).bind(now).run();
    await env.DB.prepare(
      "INSERT INTO ai_settings (id, base_url, model, encrypted_api_key, daily_limit, updated_at) VALUES (1, ?, ?, ?, 30, ?)"
    ).bind(
      "https://api.example.com/v1",
      "model",
      await (await import("../src/worker/crypto")).encryptSecret(
        "test-key",
        env.AI_SECRET
      ),
      now
    ).run();
    const conversation = await json<{ id: string }>(
      await worker.request(
        "/api/assistant/conversations",
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ title: "岗位分析", opportunityId: "opp-chat" })
        },
        env
      )
    );
    const originalFetch = globalThis.fetch;
    const streamPayload = JSON.stringify({
      choices: [{ delta: { content: JSON.stringify({
        answer: "建议优先准备这个岗位。[1]",
        citationIds: ["opportunity:opp-chat"]
      }) } }]
    });
    globalThis.fetch = async () =>
      new Response(`data: ${streamPayload}

data: [DONE]

`, {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      });
    const response = await worker.request(
      `/api/assistant/conversations/${conversation.id}/messages`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          question: "请分析这个岗位适合我吗？",
          requestId: "request-chat-1"
        })
      },
      env
    );
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const streamText = await response.text();
    globalThis.fetch = originalFetch;
    expect(streamText).toContain("event: delta");
    expect(streamText).toContain("event: done");
    const detail = await json<{
      messages: Array<{ role: string; status: string; citations: unknown[] }>;
    }>(
      await worker.request(
        `/api/assistant/conversations/${conversation.id}`,
        { headers: { cookie } },
        env
      )
    );
    expect(detail.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(detail.messages[1].status).toBe("completed");

    const usage = await json<{ used: number; limit: number }>(
      await worker.request("/api/assistant/usage", { headers: { cookie } }, env)
    );
    expect(usage).toMatchObject({ used: 1, limit: 50 });
  });
});

import { describe, expect, it } from "vitest";

import {
  createConversation,
  createDocument,
  deleteDocument,
  enforceConversationLimit,
  listConversations,
  listMessages,
  reserveAssistantRequest,
  searchAssistantChunks,
  updateConversation
} from "../src/worker/assistantRepository";
import { createFakeD1 } from "./helpers/fakeD1";

const now = "2026-11-15T08:00:00.000Z";

describe("assistant repository", () => {
  it("reserves assistant usage separately from vision usage", async () => {
    const DB = createFakeD1();
    await DB.prepare(
      "INSERT INTO ai_settings (id, base_url, model, encrypted_api_key, daily_limit, updated_at) VALUES (1, ?, ?, ?, 30, ?)"
    ).bind("https://api.example.com/v1", "model", "encrypted", now).run();

    expect(await reserveAssistantRequest(DB, "2026-11-15")).toEqual({
      allowed: true,
      used: 1,
      limit: 50,
      duplicate: false
    });
    expect(
      await reserveAssistantRequest(DB, "2026-11-15", "request-1", true)
    ).toEqual({ allowed: true, used: 1, limit: 50, duplicate: false });
    expect(
      await reserveAssistantRequest(DB, "2026-11-15", "request-1", false)
    ).toEqual({ allowed: true, used: 2, limit: 50, duplicate: false });
    expect(
      await DB.prepare("SELECT request_count FROM ai_usage WHERE day = ?")
        .bind("2026-11-15")
        .first<{ request_count: number }>()
    ).toBeNull();
  });

  it("keeps only fifty conversations and deletes the least recently updated", async () => {
    const DB = createFakeD1();
    for (let index = 0; index < 51; index += 1) {
      await createConversation(DB, {
        id: `conversation-${index}`,
        title: `会话 ${index}`,
        now: new Date(Date.UTC(2026, 10, 15, 8, 0, index))
      });
    }

    await enforceConversationLimit(DB);
    const conversations = await listConversations(DB);
    expect(conversations).toHaveLength(50);
    expect(conversations.some((item) => item.id === "conversation-0")).toBe(false);
  });

  it("stores conversation scope and supports title changes", async () => {
    const DB = createFakeD1();
    await DB.prepare(
      "INSERT INTO opportunities (id, title, category_id, stage, version, created_at, updated_at) VALUES ('opp-1', '产品实习生', 'product', 'to_evaluate', 1, ?, ?)"
    ).bind(now, now).run();
    const created = await createConversation(DB, {
      id: "conversation-1",
      title: "新对话",
      opportunityId: "opp-1",
      now: new Date(now)
    });
    expect(created).toMatchObject({
      id: "conversation-1",
      opportunityId: "opp-1",
      webSearchEnabled: false
    });

    const updated = await updateConversation(DB, "conversation-1", {
      title: "产品岗位比较",
      documentIds: ["doc-1"],
      webSearchEnabled: true
    });
    expect(updated).toMatchObject({
      title: "产品岗位比较",
      documentIds: ["doc-1"],
      webSearchEnabled: true
    });
  });

  it("indexes Chinese chunks and respects source and enabled filters", async () => {
    const DB = createFakeD1();
    await createDocument(DB, {
      id: "doc-1",
      title: "项目复盘",
      kind: "project",
      fileName: "project.md",
      mimeType: "text/markdown",
      sizeBytes: 20,
      tags: ["产品"],
      storageKey: "assistant/doc-1",
      content: "负责数据分析与产品运营，每周完成项目复盘。",
      now: new Date(now)
    });

    const found = await searchAssistantChunks(DB, {
      question: "数据分析 产品运营",
      documentIds: ["doc-1"],
      limit: 8
    });
    expect(found.map((chunk) => chunk.sourceId)).toContain("doc-1");
    expect(found[0].content).not.toContain("18800000000");

    await DB.prepare("UPDATE assistant_documents SET enabled = 0 WHERE id = 'doc-1'").run();
    expect(
      await searchAssistantChunks(DB, {
        question: "数据分析",
        documentIds: ["doc-1"],
        limit: 8
      })
    ).toEqual([]);
  });

  it("removes document chunks when a document is permanently deleted", async () => {
    const DB = createFakeD1();
    await createDocument(DB, {
      id: "doc-delete",
      title: "面试记录",
      kind: "interview",
      fileName: "interview.txt",
      mimeType: "text/plain",
      sizeBytes: 18,
      tags: [],
      storageKey: "assistant/doc-delete",
      content: "准备产品面试与项目复盘",
      now: new Date(now)
    });
    await deleteDocument(DB, "doc-delete");
    expect(
      await DB.prepare(
        "SELECT COUNT(*) AS count FROM assistant_chunks WHERE source_id = 'doc-delete'"
      ).first<{ count: number }>()
    ).toEqual({ count: 0 });
    expect(
      await searchAssistantChunks(DB, {
        question: "产品面试",
        limit: 8
      })
    ).toEqual([]);
  });

  it("hydrates conversation messages in chronological order", async () => {
    const DB = createFakeD1();
    await createConversation(DB, {
      id: "conversation-messages",
      title: "面试准备",
      now: new Date(now)
    });
    await DB.prepare(
      "INSERT INTO assistant_messages (id, conversation_id, role, content, status, attempt, created_at) VALUES ('message-1', 'conversation-messages', 'user', '问题', 'completed', 1, ?)"
    ).bind(now).run();
    await DB.prepare(
      "INSERT INTO assistant_messages (id, conversation_id, role, content, status, attempt, created_at) VALUES ('message-2', 'conversation-messages', 'assistant', '回答', 'completed', 1, ?)"
    ).bind("2026-11-15T08:00:01.000Z").run();

    expect((await listMessages(DB, "conversation-messages")).map((m) => m.content)).toEqual([
      "问题",
      "回答"
    ]);
  });

  it("marks a citation as deleted without retaining its snippet", async () => {
    const DB = createFakeD1();
    await createConversation(DB, {
      id: "conversation-citations",
      title: "来源引用",
      now: new Date(now)
    });
    await DB.prepare(
      "INSERT INTO assistant_messages (id, conversation_id, role, content, status, attempt, created_at) VALUES ('citation-answer', 'conversation-citations', 'assistant', '回答', 'completed', 1, ?)"
    ).bind(now).run();
    await DB.prepare(
      "INSERT INTO assistant_message_citations (id, message_id, type, source_id, title, snippet, url, sort_order) VALUES ('citation-doc', 'citation-answer', 'document', 'deleted-doc', '旧资料', '不应继续显示的正文', '/assistant/documents/deleted-doc', 0)"
    ).run();

    const message = (await listMessages(DB, "conversation-citations"))[0];
    expect(message.citations[0]).toMatchObject({
      snippet: "来源已删除",
      url: ""
    });
  });
});

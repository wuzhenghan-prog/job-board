import { Hono, type Context } from "hono";
import { z } from "zod";

import {
  buildConversationTitle,
  redactContactLines
} from "../shared/assistant";
import type { JobBoardEnv } from "./env";
import {
  addMessageCitation,
  appendAssistantChunk,
  completeAssistantMessage,
  createConversation,
  createAssistantMessage,
  createDocument,
  createUserMessage,
  deleteConversation,
  deleteDocument,
  enforceConversationLimit,
  getAssistantUsage,
  getConversation,
  getDocument,
  getDocumentStorageKey,
  getConversationMessage,
  findLatestCitation,
  findMessage,
  findUserQuestionBefore,
  isMessageStreaming,
  listConversations,
  listDocuments,
  listMessages,
  reserveAssistantRequest,
  searchAssistantChunks,
  updateConversation,
  updateDocument,
  updateMessageContent
} from "./assistantRepository";
import { decryptSecret } from "./crypto";
import {
  buildAssistantMessages,
  runAssistantStreamingCompletion
} from "./assistantChat";
import { readPublicWebPages } from "./assistantWeb";
import {
  selectVerifiedCitations,
  transitionMessageStatus,
  type AssistantCitation
} from "../shared/assistant";
import { toUsageDay } from "./usage";

const createConversationSchema = z.object({
  title: z.string().trim().max(80).optional(),
  opportunityId: z.string().trim().min(1).max(100).nullable().optional(),
  documentIds: z.array(z.string().trim().min(1).max(100)).max(50).optional()
});

const updateConversationSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  opportunityId: z.string().trim().min(1).max(100).nullable().optional(),
  documentIds: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  webSearchEnabled: z.boolean().optional()
});

const uploadSchema = z.object({
  title: z.string().trim().min(1).max(120),
  kind: z.enum(["resume", "job", "project", "interview", "other"]),
  tags: z.array(z.string().trim().min(1).max(24)).max(8),
  content: z.string().trim().min(1).max(200_000)
});

const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
  enabled: z.boolean().optional()
});

const messageSchema = z.object({
  question: z.string().trim().min(1).max(4_000),
  requestId: z.string().trim().min(8).max(120),
  replacesMessageId: z.string().trim().min(1).max(100).optional()
});

const allowedMimeTypes = new Map([
  ["text/markdown", ["md", "markdown"]],
  ["text/plain", ["txt"]],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ["docx"]
  ],
  ["application/pdf", ["pdf"]]
]);

function extensionOf(name: string): string {
  return name.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? "";
}

function acceptedDocumentType(name: string, type: string): boolean {
  const extension = extensionOf(name);
  if (extension === "doc") return false;
  return [...allowedMimeTypes.entries()].some(
    ([mime, extensions]) => extensions.includes(extension) && (type === mime || !type)
  );
}

function cleanFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\r\n]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180) || "document.txt";
}

function safeDownloadName(fileName: string): string {
  return encodeURIComponent(cleanFileName(fileName));
}

async function uploadDocument(c: Context<{ Bindings: JobBoardEnv }>) {
  const contentType = c.req.header("content-type") ?? "";
  let file: {
    name: string;
    type: string;
    size: number;
    bytes: Uint8Array;
  };
  let fields: Record<string, unknown>;

  if (contentType.includes("application/json")) {
    const body = (await c.req.json().catch(() => null)) as {
      title?: unknown;
      kind?: unknown;
      tags?: unknown;
      content?: unknown;
      fileName?: unknown;
      mimeType?: unknown;
      bytes?: unknown;
    } | null;
    const content = typeof body?.content === "string" ? body.content : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName : "document.txt";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "text/plain";
    file = {
      name: fileName,
      type: mimeType,
      size: new TextEncoder().encode(content).byteLength,
      bytes: new TextEncoder().encode(content)
    };
    fields = {
      title: body?.title,
      kind: body?.kind,
      tags: body?.tags,
      content: body?.content
    };
  } else {
    const form = await c.req.parseBody({ all: true }).catch(() => null);
    const candidate = form?.file;
    if (!(candidate instanceof File)) {
      return c.json({ error: "请选择一个资料文件" }, 422);
    }
    file = {
      name: candidate.name,
      type: candidate.type,
      size: candidate.size,
      bytes: new Uint8Array(await candidate.arrayBuffer())
    };
    let tags: unknown = [];
    if (typeof form?.tags === "string") {
      try {
        tags = JSON.parse(form.tags);
      } catch {
        tags = [];
      }
    }
    fields = {
      title: form?.title,
      kind: form?.kind,
      tags,
      content: form?.content
    };
  }

  if (file.size > 15 * 1024 * 1024) {
    return c.json({ error: "资料文件不能超过 15MB" }, 422);
  }
  if (!acceptedDocumentType(file.name, file.type)) {
    return c.json({ error: "只支持 Markdown、TXT、Word（.docx）或 PDF 文件" }, 422);
  }
  const parsed = uploadSchema.safeParse(fields);
  if (!parsed.success) {
    return c.json({ error: "资料标题、类型、标签或正文格式不正确" }, 422);
  }
  const uniqueTags = [...new Set(parsed.data.tags)];
  const id = crypto.randomUUID();
  const storageKey = `assistant/${id}`;
  try {
    await c.env.SCREENSHOTS.put(storageKey, file.bytes);
    const record = await createDocument(c.env.DB, {
      id,
      title: parsed.data.title,
      kind: parsed.data.kind,
      fileName: cleanFileName(file.name),
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      tags: uniqueTags,
      storageKey,
      content: parsed.data.content
    });
    return c.json(record, 201);
  } catch (error) {
    await c.env.SCREENSHOTS.delete(storageKey).catch(() => undefined);
    return c.json(
      { error: error instanceof Error ? error.message : "资料保存失败" },
      error instanceof Error && /上限|最多|不能超过/.test(error.message) ? 422 : 500
    );
  }
}

const assistant = new Hono<{ Bindings: JobBoardEnv }>();

assistant.get("/capabilities", (c) =>
  c.json({ mode: "read-only", canModifyBusinessData: false })
);

assistant.get("/usage", async (c) => {
  const usage = await getAssistantUsage(c.env.DB, toUsageDay());
  return c.json({ day: toUsageDay(), used: usage.used, limit: usage.limit });
});

assistant.get("/conversations", async (c) => {
  return c.json(await listConversations(c.env.DB));
});

assistant.post("/conversations", async (c) => {
  const parsed = createConversationSchema.safeParse(
    await c.req.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return c.json({ error: "会话参数格式不正确" }, 422);
  }
  if (parsed.data.opportunityId) {
    const opportunity = await c.env.DB.prepare(
      "SELECT id FROM opportunities WHERE id = ?"
    ).bind(parsed.data.opportunityId).first();
    if (!opportunity) return c.json({ error: "锁定岗位不存在" }, 404);
  }
  await enforceConversationLimit(c.env.DB);
  const title =
    parsed.data.title?.trim() ||
    (parsed.data.opportunityId ? "岗位分析" : "新对话");
  const conversation = await createConversation(c.env.DB, {
    title,
    opportunityId: parsed.data.opportunityId,
    documentIds: parsed.data.documentIds
  });
  return c.json(conversation, 201);
});

assistant.get("/conversations/:id", async (c) => {
  const conversation = await getConversation(c.env.DB, c.req.param("id"));
  if (!conversation) return c.json({ error: "会话不存在" }, 404);
  return c.json({
    ...conversation,
    messages: await listMessages(c.env.DB, conversation.id)
  });
});

assistant.patch("/conversations/:id", async (c) => {
  const parsed = updateConversationSchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) return c.json({ error: "会话参数格式不正确" }, 422);
  const current = await getConversation(c.env.DB, c.req.param("id"));
  if (!current) return c.json({ error: "会话不存在" }, 404);
  if (parsed.data.documentIds?.length) {
    const unique = [...new Set(parsed.data.documentIds)];
    for (const id of unique) {
      if (!(await getDocument(c.env.DB, id))) {
        return c.json({ error: "指定资料不存在" }, 404);
      }
    }
    parsed.data.documentIds = unique;
  }
  return c.json(await updateConversation(c.env.DB, current.id, parsed.data));
});

assistant.delete("/conversations/:id", async (c) => {
  const current = await getConversation(c.env.DB, c.req.param("id"));
  if (!current) return c.json({ error: "会话不存在" }, 404);
  await deleteConversation(c.env.DB, current.id);
  return c.body(null, 204);
});

assistant.post("/conversations/:id/messages", async (c) => {
  const conversation = await getConversation(c.env.DB, c.req.param("id"));
  if (!conversation) return c.json({ error: "会话不存在" }, 404);
  const parsed = messageSchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json({ error: "问题不能为空，且不能超过 4,000 字" }, 422);
  }
  const streaming = await c.env.DB.prepare(
    "SELECT id FROM assistant_messages WHERE status = 'streaming' LIMIT 1"
  ).first();
  if (streaming) {
    return c.json({ error: "仍有一条回答正在生成，请稍候" }, 409);
  }
  const reservation = await reserveAssistantRequest(
    c.env.DB,
    toUsageDay(),
    parsed.data.requestId,
    true
  );
  if (!reservation.allowed) {
    return c.json(
      { error: `今日 AI 问答已达 ${reservation.limit} 次上限` },
      429
    );
  }
  await reserveAssistantRequest(
    c.env.DB,
    toUsageDay(),
    parsed.data.requestId,
    false
  );

  const existingRequest = await c.env.DB.prepare(
    "SELECT id FROM assistant_messages WHERE request_id = ?"
  ).bind(parsed.data.requestId).first<{ id: string }>();
  if (existingRequest) {
    return c.json({ error: "该请求已处理，请刷新会话" }, 409);
  }

  const settings = await c.env.DB.prepare(
    "SELECT base_url, model, encrypted_api_key FROM ai_settings WHERE id = 1"
  ).first<{
    base_url: string;
    model: string;
    encrypted_api_key: string;
  }>();
  if (!settings) {
    return c.json({ error: "尚未配置 AI 模型" }, 409);
  }

  const history = await listMessages(c.env.DB, conversation.id);
  const assistantHistory = history
    .filter((message) => message.status === "completed")
    .slice(-20)
    .map((message) => ({ role: message.role, content: message.content }));
  const chunks = await searchAssistantChunks(c.env.DB, {
    question: parsed.data.question,
    opportunityId: conversation.opportunityId,
    documentIds: conversation.documentIds,
    limit: 8
  });
  const citations: AssistantCitation[] = [];
  const citationById = new Map<string, AssistantCitation>();
  for (const chunk of chunks) {
    const source = await findLatestCitation(
      c.env.DB,
      chunk.sourceType,
      chunk.sourceId
    );
    if (!source) continue;
    const id = `${chunk.sourceType}:${chunk.sourceId}`;
    if (!citationById.has(id)) {
      const citation = {
        id,
        type: chunk.sourceType,
        sourceId: chunk.sourceId,
        title: source.title,
        snippet: source.snippet,
        url: source.url
      } as const;
      citationById.set(id, citation);
      citations.push(citation);
    }
  }
  let webPages: Awaited<ReturnType<typeof readPublicWebPages>> = [];
  let webFallback = "";
  if (conversation.webSearchEnabled) {
    webPages = await readPublicWebPages({
      query: parsed.data.question,
      limit: 3,
      maxCharactersPerPage: 8_000
    });
    for (const [index, page] of webPages.entries()) {
      const citation = {
        id: `web:${index + 1}`,
        type: "web",
        sourceId: page.url,
        title: page.title,
        snippet: page.snippet,
        url: page.url
      } as const;
      citationById.set(citation.id, citation);
      citations.push(citation);
    }
    if (webPages.length === 0) {
      webFallback = "\n\n本次未获得可验证的外部网页依据。";
    }
  }

  const profile = await c.env.DB.prepare(
    "SELECT summary, skills, experiences, strengths, gaps FROM profile WHERE id = 1"
  ).first<{
    summary: string;
    skills: string;
    experiences: string;
    strengths: string;
    gaps: string;
  }>();
  const profileForAI = profile
    ? {
        summary: profile.summary,
        skills: JSON.parse(profile.skills) as string[],
        experiences: JSON.parse(profile.experiences) as string[],
        strengths: JSON.parse(profile.strengths) as string[],
        gaps: JSON.parse(profile.gaps) as string[]
      }
    : { summary: "", skills: [], experiences: [], strengths: [], gaps: [] };

  await createUserMessage(c.env.DB, {
    conversationId: conversation.id,
    content: parsed.data.question,
    requestId: parsed.data.requestId
  });
  let attempt = 1;
  if (parsed.data.replacesMessageId) {
    const replaced = await findMessage(c.env.DB, parsed.data.replacesMessageId);
    if (
      !replaced ||
      replaced.role !== "assistant" ||
      replaced.conversationId !== conversation.id
    ) {
      return c.json({ error: "要重试的回答不存在" }, 404);
    }
    attempt = replaced.attempt + 1;
  }
  const assistantMessage = await createAssistantMessage(c.env.DB, {
    conversationId: conversation.id,
    attempt,
    replacesMessageId: parsed.data.replacesMessageId
  });
  let apiKey: string;
  try {
    apiKey = await decryptSecret(settings.encrypted_api_key, c.env.AI_SECRET);
  } catch {
    await completeAssistantMessage(c.env.DB, {
      messageId: assistantMessage.id,
      content: "",
      status: "failed",
      citations: []
    });
    return c.json({ error: "AI 密钥读取失败，请在设置中重新保存" }, 500);
  }

  const modelMessages = buildAssistantMessages({
    question: parsed.data.question,
    citations,
    profile: profileForAI,
    history: assistantHistory,
    webEnabled: conversation.webSearchEnabled
  });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };
      send("meta", { messageId: assistantMessage.id });
      try {
        const result = await runAssistantStreamingCompletion({
          config: {
            baseUrl: settings.base_url,
            model: settings.model,
            apiKey
          },
          messages: modelMessages,
          onDelta: (text) => {
            send("delta", { text });
            void appendAssistantChunk(c.env.DB, assistantMessage.id, text);
          }
        });
        if (!(await isMessageStreaming(c.env.DB, assistantMessage.id))) {
          send("stopped", { messageId: assistantMessage.id, status: "stopped" });
          return;
        }
        const verified = selectVerifiedCitations(
          result.citationIds,
          citations
        );
        const finalAnswer = result.answer + webFallback;
        await completeAssistantMessage(c.env.DB, {
          messageId: assistantMessage.id,
          content: finalAnswer,
          status: "completed",
          citations: []
        });
        for (const [index, citation] of verified.entries()) {
          await addMessageCitation(
            c.env.DB,
            assistantMessage.id,
            citation,
            index
          );
        }
        send("citations", verified);
        send("done", { messageId: assistantMessage.id, status: "completed" });
      } catch {
        await updateMessageContent(c.env.DB, assistantMessage.id, "");
        await completeAssistantMessage(c.env.DB, {
          messageId: assistantMessage.id,
          content: "",
          status: "failed",
          citations: []
        });
        send("error", { message: "回答生成失败，请稍后重试" });
      } finally {
        controller.close();
      }
    }
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    }
  });
});

assistant.post("/messages/:id/stop", async (c) => {
  const message = await findMessage(c.env.DB, c.req.param("id"));
  if (!message || message.role !== "assistant") {
    return c.json({ error: "回答消息不存在" }, 404);
  }
  if (message.status !== "streaming") {
    return c.json({ error: "该回答已经结束" }, 409);
  }
  await completeAssistantMessage(c.env.DB, {
    messageId: message.id,
    content: message.content,
    status: "stopped",
    citations: []
  });
  return c.json({ ok: true, status: "stopped" });
});

assistant.post("/messages/:id/retry", async (c) => {
  const message = await findMessage(c.env.DB, c.req.param("id"));
  if (!message || message.role !== "assistant") {
    return c.json({ error: "回答消息不存在" }, 404);
  }
  if (message.status === "streaming") {
    return c.json({ error: "当前回答仍在生成" }, 409);
  }
  const question = await findUserQuestionBefore(
    c.env.DB,
    message.conversationId,
    message.id
  );
  if (!question) return c.json({ error: "找不到原始问题" }, 409);
  const conversation = await getConversation(c.env.DB, message.conversationId);
  if (!conversation) return c.json({ error: "会话不存在" }, 404);
  return c.json({
    ok: true,
    question: question.content,
    replacementFor: message.id,
    attempt: message.attempt + 1
  });
});

assistant.get("/documents", async (c) => {
  const documents = await listDocuments(c.env.DB);
  return c.json(
    documents.map((document) => ({
      ...document,
      content: undefined
    }))
  );
});

assistant.post("/documents", uploadDocument);

assistant.get("/documents/:id", async (c) => {
  const document = await getDocument(c.env.DB, c.req.param("id"));
  if (!document) return c.json({ error: "资料不存在" }, 404);
  return c.json(document);
});

assistant.patch("/documents/:id", async (c) => {
  const parsed = updateDocumentSchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) return c.json({ error: "资料参数格式不正确" }, 422);
  if (!(await getDocument(c.env.DB, c.req.param("id")))) {
    return c.json({ error: "资料不存在" }, 404);
  }
  return c.json(
    await updateDocument(c.env.DB, c.req.param("id"), {
      ...parsed.data,
      tags: parsed.data.tags ? [...new Set(parsed.data.tags)] : undefined
    })
  );
});

assistant.get("/documents/:id/file", async (c) => {
  const document = await getDocument(c.env.DB, c.req.param("id"));
  if (!document) return c.json({ error: "资料不存在" }, 404);
  const storageKey = await getDocumentStorageKey(c.env.DB, document.id);
  if (!storageKey) return c.json({ error: "资料不存在" }, 404);
  const bytes = await c.env.SCREENSHOTS.get(storageKey, "arrayBuffer");
  if (!bytes) return c.json({ error: "资料原件不存在" }, 404);
  return new Response(bytes, {
    headers: {
      "content-type": document.mimeType,
      "content-disposition": `attachment; filename*=UTF-8''${safeDownloadName(document.fileName)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff"
    }
  });
});

assistant.delete("/documents/:id", async (c) => {
  const document = await getDocument(c.env.DB, c.req.param("id"));
  if (!document) return c.json({ error: "资料不存在" }, 404);
  const storageKey = await getDocumentStorageKey(c.env.DB, document.id);
  await deleteDocument(c.env.DB, document.id);
  if (storageKey) await c.env.SCREENSHOTS.delete(storageKey).catch(() => undefined);
  return c.body(null, 204);
});

export default assistant;

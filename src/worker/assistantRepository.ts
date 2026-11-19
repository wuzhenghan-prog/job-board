import {
  buildSearchPhrases,
  readableCitationSnippet,
  redactContactLines,
  trimToCharacterBudget,
  type AssistantCitation
} from "../shared/assistant";

type AssistantDB = Pick<D1Database, "prepare" | "batch">;

export type ConversationRecord = {
  id: string;
  title: string;
  opportunityId: string | null;
  documentIds: string[];
  webSearchEnabled: boolean;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

export type MessageRecord = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  status: "streaming" | "completed" | "stopped" | "failed";
  attempt: number;
  replacesMessageId: string | null;
  createdAt: string;
  completedAt: string | null;
  citations: AssistantCitation[];
};

export type DocumentRecord = {
  id: string;
  title: string;
  kind: "resume" | "job" | "project" | "interview" | "other";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  tags: string[];
  enabled: boolean;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type ConversationRow = {
  id: string;
  title: string;
  opportunity_id: string | null;
  document_ids: string;
  web_search_enabled: number;
  summary: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  status: "streaming" | "completed" | "stopped" | "failed";
  attempt: number;
  replaces_message_id: string | null;
  created_at: string;
  completed_at: string | null;
};

type DocumentRow = {
  id: string;
  title: string;
  kind: DocumentRecord["kind"];
  file_name: string;
  mime_type: string;
  size_bytes: number;
  tags: string;
  enabled: number;
  content: string;
  created_at: string;
  updated_at: string;
};

type UsageRow = {
  request_count: number;
};

type SettingsRow = {
  assistant_daily_limit: number;
};

type ChunkRow = {
  id: string;
  source_type: "opportunity" | "document";
  source_id: string;
  content: string;
};

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function mapConversation(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    title: row.title,
    opportunityId: row.opportunity_id,
    documentIds: parseStringArray(row.document_ids),
    webSearchEnabled: row.web_search_enabled === 1,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    tags: parseStringArray(row.tags),
    enabled: row.enabled === 1,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const chunkSize = 2_000;

function chunkText(text: string): string[] {
  const redacted = redactContactLines(text);
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < redacted.length) {
    chunks.push(trimToCharacterBudget(redacted.slice(cursor), chunkSize));
    cursor += chunkSize;
  }
  return chunks.filter((item) => item.trim().length > 0);
}

function readableIndexContent(text: string): string {
  return text
    .replace(/[\[\]"]/g, "")
    .replace(/","/g, "；")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

async function replaceChunks(
  DB: AssistantDB,
  sourceType: "opportunity" | "document",
  sourceId: string,
  content: string,
  now: string
): Promise<void> {
  await DB.prepare(
    "DELETE FROM assistant_chunks WHERE source_type = ? AND source_id = ?"
  ).bind(sourceType, sourceId).run();
  const chunks = chunkText(content);
  const statements = chunks.map((chunk, index) =>
    DB.prepare(
      "INSERT INTO assistant_chunks (id, source_type, source_id, chunk_index, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(
      crypto.randomUUID(),
      sourceType,
      sourceId,
      index,
      chunk,
      now
    )
  );
  if (statements.length > 0) await DB.batch(statements);
}

export async function listConversations(
  DB: AssistantDB
): Promise<ConversationRecord[]> {
  const rows = await DB.prepare(
    "SELECT * FROM assistant_conversations ORDER BY updated_at DESC"
  ).all<ConversationRow>();
  return rows.results.map(mapConversation);
}

export async function createConversation(
  DB: AssistantDB,
  input: {
    id?: string;
    title: string;
    opportunityId?: string | null;
    documentIds?: string[];
    now?: Date;
  }
): Promise<ConversationRecord> {
  const id = input.id ?? crypto.randomUUID();
  const timestamp = (input.now ?? new Date()).toISOString();
  await DB.prepare(
    "INSERT INTO assistant_conversations (id, title, opportunity_id, document_ids, web_search_enabled, summary, created_at, updated_at) VALUES (?, ?, ?, ?, 0, '', ?, ?)"
  ).bind(
    id,
    input.title,
    input.opportunityId ?? null,
    JSON.stringify(input.documentIds ?? []),
    timestamp,
    timestamp
  ).run();
  return {
    id,
    title: input.title,
    opportunityId: input.opportunityId ?? null,
    documentIds: input.documentIds ?? [],
    webSearchEnabled: false,
    summary: "",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export async function getConversation(
  DB: AssistantDB,
  id: string
): Promise<ConversationRecord | null> {
  const row = await DB.prepare(
    "SELECT * FROM assistant_conversations WHERE id = ?"
  ).bind(id).first<ConversationRow>();
  return row ? mapConversation(row) : null;
}

export async function updateConversation(
  DB: AssistantDB,
  id: string,
  input: {
    title?: string;
    opportunityId?: string | null;
    documentIds?: string[];
    webSearchEnabled?: boolean;
    summary?: string;
  }
): Promise<ConversationRecord> {
  const current = await getConversation(DB, id);
  if (!current) throw new Error("会话不存在");
  const timestamp = new Date().toISOString();
  const title = input.title ?? current.title;
  const opportunityId =
    input.opportunityId === undefined ? current.opportunityId : input.opportunityId;
  const documentIds = input.documentIds ?? current.documentIds;
  const webSearchEnabled = input.webSearchEnabled ?? current.webSearchEnabled;
  const summary = input.summary ?? current.summary;
  await DB.prepare(
    "UPDATE assistant_conversations SET title = ?, opportunity_id = ?, document_ids = ?, web_search_enabled = ?, summary = ?, updated_at = ? WHERE id = ?"
  ).bind(
    title,
    opportunityId,
    JSON.stringify(documentIds),
    webSearchEnabled ? 1 : 0,
    summary,
    timestamp,
    id
  ).run();
  return {
    id,
    title,
    opportunityId,
    documentIds,
    webSearchEnabled,
    summary,
    createdAt: current.createdAt,
    updatedAt: timestamp
  };
}

export async function deleteConversation(DB: AssistantDB, id: string): Promise<void> {
  await DB.prepare("DELETE FROM assistant_conversations WHERE id = ?").bind(id).run();
}

export async function enforceConversationLimit(DB: AssistantDB): Promise<void> {
  await DB.prepare(
    "DELETE FROM assistant_conversations WHERE id IN (SELECT id FROM assistant_conversations ORDER BY updated_at DESC LIMIT -1 OFFSET 50)"
  ).run();
}

export async function listMessages(
  DB: AssistantDB,
  conversationId: string
): Promise<MessageRecord[]> {
  const rows = await DB.prepare(
    "SELECT * FROM assistant_messages WHERE conversation_id = ? ORDER BY created_at ASC"
  ).bind(conversationId).all<MessageRow>();
  const messages: MessageRecord[] = [];
  for (const row of rows.results) {
    const citations = await DB.prepare(
      `SELECT c.id, c.type, c.source_id, c.title, c.snippet, c.url,
        CASE
          WHEN c.type = 'opportunity' AND o.id IS NULL THEN '来源已删除'
          WHEN c.type = 'document' AND d.id IS NULL THEN '来源已删除'
          ELSE c.snippet
        END AS resolved_snippet,
        CASE
          WHEN c.type = 'opportunity' AND o.id IS NULL THEN 1
          WHEN c.type = 'document' AND d.id IS NULL THEN 1
          ELSE 0
        END AS deleted
       FROM assistant_message_citations c
       LEFT JOIN opportunities o ON c.type = 'opportunity' AND o.id = c.source_id
       LEFT JOIN assistant_documents d ON c.type = 'document' AND d.id = c.source_id
       WHERE c.message_id = ? ORDER BY c.sort_order ASC`
    ).bind(row.id).all<{
      id: string;
      type: AssistantCitation["type"];
      source_id: string;
      title: string;
      snippet: string;
      resolved_snippet: string;
      deleted: number;
      url: string;
    }>();
    messages.push({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      status: row.status,
      attempt: row.attempt,
      replacesMessageId: row.replaces_message_id,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      citations: citations.results.map((citation) => ({
        id: citation.id,
        type: citation.type,
        sourceId: citation.source_id,
        title: citation.title,
        snippet: citation.resolved_snippet,
        url: citation.deleted === 1 ? "" : citation.url
      }))
    });
  }
  return messages;
}

export async function reserveAssistantRequest(
  DB: AssistantDB,
  day: string,
  requestId?: string,
  reserveOnly = false
): Promise<
  | { allowed: true; used: number; limit: number; duplicate: boolean }
  | { allowed: false; used: number; limit: number }
> {
  const settings = await DB.prepare(
    "SELECT assistant_daily_limit FROM ai_settings WHERE id = 1"
  ).first<SettingsRow>();
  const limit = settings?.assistant_daily_limit ?? 50;
  if (requestId) {
    const existing = await DB.prepare(
      "SELECT id FROM assistant_messages WHERE request_id = ?"
    ).bind(requestId).first();
    if (existing) {
      const usage = await DB.prepare(
        "SELECT request_count FROM assistant_usage WHERE day = ?"
      ).bind(day).first<UsageRow>();
      return {
        allowed: true,
        used: usage?.request_count ?? 0,
        limit,
        duplicate: true
      };
    }
  }
  if (reserveOnly) {
    const usage = await DB.prepare(
      "SELECT request_count FROM assistant_usage WHERE day = ?"
    ).bind(day).first<UsageRow>();
    const used = usage?.request_count ?? 0;
    return { allowed: used < limit, used, limit, duplicate: false };
  }
  const usage = await DB.prepare(
    "SELECT request_count FROM assistant_usage WHERE day = ?"
  ).bind(day).first<UsageRow>();
  const used = usage?.request_count ?? 0;
  if (used >= limit) return { allowed: false, used, limit };
  await DB.prepare(
    "INSERT INTO assistant_usage (day, request_count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET request_count = request_count + 1"
  ).bind(day).run();
  return { allowed: true, used: used + 1, limit, duplicate: false };
}

export async function getAssistantUsage(
  DB: AssistantDB,
  day: string
): Promise<{ used: number; limit: number }> {
  const settings = await DB.prepare(
    "SELECT assistant_daily_limit FROM ai_settings WHERE id = 1"
  ).first<SettingsRow>();
  const usage = await DB.prepare(
    "SELECT request_count FROM assistant_usage WHERE day = ?"
  ).bind(day).first<UsageRow>();
  return {
    used: usage?.request_count ?? 0,
    limit: settings?.assistant_daily_limit ?? 50
  };
}

export async function createUserMessage(
  DB: AssistantDB,
  input: {
    id?: string;
    conversationId: string;
    content: string;
    requestId?: string;
    now?: Date;
  }
): Promise<MessageRecord> {
  const id = input.id ?? crypto.randomUUID();
  const timestamp = (input.now ?? new Date()).toISOString();
  await DB.prepare(
    "INSERT INTO assistant_messages (id, conversation_id, role, content, status, attempt, request_id, created_at, completed_at) VALUES (?, ?, 'user', ?, 'completed', 1, ?, ?, ?)"
  ).bind(
    id,
    input.conversationId,
    input.content,
    input.requestId ?? null,
    timestamp,
    timestamp
  ).run();
  await DB.prepare(
    "UPDATE assistant_conversations SET updated_at = ? WHERE id = ?"
  ).bind(timestamp, input.conversationId).run();
  return {
    id,
    conversationId: input.conversationId,
    role: "user",
    content: input.content,
    status: "completed",
    attempt: 1,
    replacesMessageId: null,
    createdAt: timestamp,
    completedAt: timestamp,
    citations: []
  };
}

export async function createAssistantMessage(
  DB: AssistantDB,
  input: {
    id?: string;
    conversationId: string;
    attempt?: number;
    replacesMessageId?: string | null;
    now?: Date;
  }
): Promise<MessageRecord> {
  const id = input.id ?? crypto.randomUUID();
  const timestamp = (input.now ?? new Date()).toISOString();
  await DB.prepare(
    "INSERT INTO assistant_messages (id, conversation_id, role, content, status, attempt, replaces_message_id, created_at) VALUES (?, ?, 'assistant', '', 'streaming', ?, ?, ?)"
  ).bind(
    id,
    input.conversationId,
    input.attempt ?? 1,
    input.replacesMessageId ?? null,
    timestamp
  ).run();
  return {
    id,
    conversationId: input.conversationId,
    role: "assistant",
    content: "",
    status: "streaming",
    attempt: input.attempt ?? 1,
    replacesMessageId: input.replacesMessageId ?? null,
    createdAt: timestamp,
    completedAt: null,
    citations: []
  };
}

export async function findMessage(
  DB: AssistantDB,
  id: string
): Promise<MessageRecord | null> {
  const row = await DB.prepare(
    "SELECT * FROM assistant_messages WHERE id = ?"
  ).bind(id).first<MessageRow>();
  if (!row) return null;
  const messages = await listMessages(DB, row.conversation_id);
  return messages.find((message) => message.id === id) ?? null;
}

export async function completeAssistantMessage(
  DB: AssistantDB,
  input: {
    messageId: string;
    content: string;
    status: "completed" | "stopped" | "failed";
    citations: AssistantCitation[];
  }
): Promise<void> {
  const timestamp = new Date().toISOString();
  await DB.prepare(
    "UPDATE assistant_messages SET content = ?, status = ?, completed_at = ? WHERE id = ?"
  ).bind(input.content, input.status, timestamp, input.messageId).run();
  const statements = input.citations.map((citation, index) =>
    DB.prepare(
      "INSERT INTO assistant_message_citations (id, message_id, type, source_id, title, snippet, url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      crypto.randomUUID(),
      input.messageId,
      citation.type,
      citation.sourceId,
      citation.title,
      citation.snippet,
      citation.url,
      index
    )
  );
  if (statements.length > 0) await DB.batch(statements);
}

export async function findLatestCitation(
  DB: AssistantDB,
  sourceType: "opportunity" | "document",
  sourceId: string
): Promise<{ title: string; snippet: string; url: string } | null> {
  const table = sourceType === "opportunity" ? "opportunities" : "assistant_documents";
  const titleColumn = sourceType === "opportunity" ? "title" : "title";
  const row = await DB.prepare(
    `SELECT ${titleColumn} AS title FROM ${table} WHERE id = ?`
  ).bind(sourceId).first<{ title: string }>();
  if (!row) return null;
  const chunk = await DB.prepare(
    "SELECT content FROM assistant_chunks WHERE source_type = ? AND source_id = ? ORDER BY chunk_index ASC LIMIT 1"
  ).bind(sourceType, sourceId).first<{ content: string }>();
  return {
    title: row.title,
    snippet: readableCitationSnippet(chunk?.content ?? "", 400),
    url:
      sourceType === "opportunity"
        ? `/opportunities/${sourceId}`
        : `/assistant/documents/${sourceId}`
  };
}

export async function getDocumentStorageKey(
  DB: AssistantDB,
  id: string
): Promise<string | null> {
  const row = await DB.prepare(
    "SELECT storage_key FROM assistant_documents WHERE id = ?"
  ).bind(id).first<{ storage_key: string }>();
  return row?.storage_key ?? null;
}

export async function addMessageCitation(
  DB: AssistantDB,
  messageId: string,
  citation: AssistantCitation,
  sortOrder: number
): Promise<void> {
  await DB.prepare(
    "INSERT INTO assistant_message_citations (id, message_id, type, source_id, title, snippet, url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    crypto.randomUUID(),
    messageId,
    citation.type,
    citation.sourceId,
    citation.title,
    citation.snippet,
    citation.url,
    sortOrder
  ).run();
}

export async function updateMessageContent(
  DB: AssistantDB,
  messageId: string,
  content: string
): Promise<void> {
  await DB.prepare(
    "UPDATE assistant_messages SET content = ? WHERE id = ?"
  ).bind(content, messageId).run();
}

export async function isMessageStreaming(
  DB: AssistantDB,
  messageId: string
): Promise<boolean> {
  const row = await DB.prepare(
    "SELECT status FROM assistant_messages WHERE id = ?"
  ).bind(messageId).first<{ status: string }>();
  return row?.status === "streaming";
}

export async function appendAssistantChunk(
  DB: AssistantDB,
  messageId: string,
  chunk: string
): Promise<void> {
  await DB.prepare(
    "UPDATE assistant_messages SET content = content || ? WHERE id = ? AND status = 'streaming'"
  ).bind(chunk, messageId).run();
}

export async function getConversationMessage(
  DB: AssistantDB,
  conversationId: string
): Promise<MessageRecord[]> {
  return listMessages(DB, conversationId);
}

export async function findUserQuestionBefore(
  DB: AssistantDB,
  conversationId: string,
  assistantMessageId: string
): Promise<MessageRecord | null> {
  const messages = await listMessages(DB, conversationId);
  const index = messages.findIndex((message) => message.id === assistantMessageId);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (messages[cursor].role === "user") return messages[cursor];
  }
  return null;
}

export async function listDocuments(DB: AssistantDB): Promise<DocumentRecord[]> {
  const rows = await DB.prepare(
    "SELECT * FROM assistant_documents ORDER BY updated_at DESC"
  ).all<DocumentRow>();
  return rows.results.map(mapDocument);
}

export async function getDocument(
  DB: AssistantDB,
  id: string
): Promise<DocumentRecord | null> {
  const row = await DB.prepare(
    "SELECT * FROM assistant_documents WHERE id = ?"
  ).bind(id).first<DocumentRow>();
  return row ? mapDocument(row) : null;
}

export async function createDocument(
  DB: AssistantDB,
  input: Omit<DocumentRecord, "enabled" | "createdAt" | "updatedAt"> & {
    storageKey: string;
    now?: Date;
  }
): Promise<DocumentRecord> {
  const now = (input.now ?? new Date()).toISOString();
  const documents = await DB.prepare(
    "SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(content)), 0) AS total FROM assistant_documents"
  ).first<{ count: number; total: number }>();
  if ((documents?.count ?? 0) >= 50) throw new Error("资料库最多保存 50 份资料");
  if ((documents?.total ?? 0) + input.content.length > 2_000_000) {
    throw new Error("资料库总文字量已达上限，请删除旧资料后重试");
  }
  if (input.content.length > 200_000) {
    throw new Error("单份资料不能超过 20 万字");
  }
  await DB.prepare(
    "INSERT INTO assistant_documents (id, title, kind, file_name, mime_type, size_bytes, tags, enabled, storage_key, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)"
  ).bind(
    input.id,
    input.title,
    input.kind,
    input.fileName,
    input.mimeType,
    input.sizeBytes,
    JSON.stringify(input.tags),
    input.storageKey,
    input.content,
    now,
    now
  ).run();
  await replaceChunks(DB, "document", input.id, input.content, now);
  return {
    id: input.id,
    title: input.title,
    kind: input.kind,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    tags: input.tags,
    enabled: true,
    content: input.content,
    createdAt: now,
    updatedAt: now
  };
}

export async function updateDocument(
  DB: AssistantDB,
  id: string,
  input: { title?: string; tags?: string[]; enabled?: boolean }
): Promise<DocumentRecord> {
  const current = await getDocument(DB, id);
  if (!current) throw new Error("资料不存在");
  const now = new Date().toISOString();
  const title = input.title ?? current.title;
  const tags = input.tags ?? current.tags;
  const enabled = input.enabled ?? current.enabled;
  await DB.prepare(
    "UPDATE assistant_documents SET title = ?, tags = ?, enabled = ?, updated_at = ? WHERE id = ?"
  ).bind(title, JSON.stringify(tags), enabled ? 1 : 0, now, id).run();
  return { ...current, title, tags, enabled, updatedAt: now };
}

export async function deleteDocument(DB: AssistantDB, id: string): Promise<void> {
  await DB.prepare(
    "DELETE FROM assistant_chunks WHERE source_type = 'document' AND source_id = ?"
  ).bind(id).run();
  await DB.prepare("DELETE FROM assistant_documents WHERE id = ?").bind(id).run();
}

export async function searchAssistantChunks(
  DB: AssistantDB,
  input: {
    question: string;
    opportunityId?: string | null;
    documentIds?: string[];
    limit: number;
  }
): Promise<Array<{ id: string; sourceType: "opportunity" | "document"; sourceId: string; content: string }>> {
  const phrases = buildSearchPhrases(input.question).filter(
    (phrase) => Array.from(phrase).length >= 3
  );
  const sourceFilter: string[] = [];
  const params: unknown[] = [];
  if (input.opportunityId) {
    sourceFilter.push("(c.source_type = 'opportunity' AND c.source_id = ?)");
    params.push(input.opportunityId);
  }
  if (input.documentIds && input.documentIds.length > 0) {
    sourceFilter.push(
      `(c.source_type = 'document' AND c.source_id IN (${input.documentIds.map(() => "?").join(",")}))`
    );
    params.push(...input.documentIds);
  }
  const scope = sourceFilter.length > 0 ? `AND (${sourceFilter.join(" OR ")})` : "";
  if (phrases.length === 0) {
    const rows = await DB.prepare(
      `SELECT c.* FROM assistant_chunks c JOIN assistant_documents d ON (c.source_type = 'document' AND d.id = c.source_id AND d.enabled = 1) OR (c.source_type = 'opportunity') WHERE c.source_type = 'opportunity' ${scope} ORDER BY c.created_at DESC LIMIT ?`
    ).bind(...params, input.limit).all<ChunkRow>();
    return rows.results.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      content: row.content
    }));
  }
  const match = phrases.map((phrase) => `"${phrase.replaceAll('"', '""')}"`).join(" OR ");
  const rows = await DB.prepare(
    `SELECT c.* FROM assistant_chunks_fts f JOIN assistant_chunks c ON c.rowid = f.rowid LEFT JOIN assistant_documents d ON c.source_type = 'document' AND d.id = c.source_id WHERE assistant_chunks_fts MATCH ? AND (c.source_type = 'opportunity' OR d.enabled = 1) ${scope} ORDER BY bm25(assistant_chunks_fts) LIMIT ?`
  ).bind(match, ...params, input.limit).all<ChunkRow>();
  if (rows.results.length > 0) {
    return rows.results.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      content: row.content
    }));
  }
  const fallback = await DB.prepare(
    `SELECT c.* FROM assistant_chunks c LEFT JOIN assistant_documents d ON c.source_type = 'document' AND d.id = c.source_id WHERE (c.source_type = 'opportunity' OR d.enabled = 1) ${scope} ORDER BY c.created_at DESC LIMIT ?`
  ).bind(...params, input.limit).all<ChunkRow>();
  return fallback.results.map((row) => ({
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    content: row.content
  }));
}

export async function indexOpportunity(
  DB: AssistantDB,
  input: {
    id: string;
    company: string | null;
    title: string;
    location: string | null;
    salary: string | null;
    categoryName: string;
    stage: string;
    responsibilities: string[];
    requirements: string[];
    abilities: { hard: string[]; general: string[]; experience: string[] };
  }
): Promise<void> {
  const content = readableIndexContent([
    input.company,
    input.title,
    input.location,
    input.salary,
    input.categoryName,
    input.stage,
    ...input.responsibilities,
    ...input.requirements,
    ...input.abilities.hard,
    ...input.abilities.general,
    ...input.abilities.experience
  ].filter(Boolean).join("\n"));
  await replaceChunks(DB, "opportunity", input.id, content, new Date().toISOString());
}

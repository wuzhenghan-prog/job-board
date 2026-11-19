export type AssistantCitationType = "opportunity" | "document" | "web";

export type AssistantCitation = {
  id: string;
  type: AssistantCitationType;
  sourceId: string;
  title: string;
  snippet: string;
  url: string;
};

export type AssistantMessageStatus =
  | "streaming"
  | "completed"
  | "stopped"
  | "failed";

const contactLinePattern =
  /^\s*(?:姓名|名字|电话|手机|邮箱|住址|地址|身份证(?:号)?|phone|email|e-mail|name|address)\s*[:：]/i;

export function buildConversationTitle(question: string): string {
  const compact = question.trim().replace(/\s+/g, " ");
  if (!compact) return "新对话";
  const withoutPoliteness = compact.replace(/(?:可以吗|好吗|谢谢|请帮我)/g, "").trim();
  const source = withoutPoliteness || compact;
  const characters = Array.from(source);
  return characters.length > 24
    ? `${characters.slice(0, 24).join("")}…`
    : source;
}

export function redactContactLines(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !contactLinePattern.test(line))
    .join("\n")
    .trim();
}

export function buildSearchPhrases(question: string): string[] {
  const normalized = question.normalize("NFKC");
  const domainTerms = [
    "高匹配", "待评估", "准备投递", "已投递", "面试中", "面试",
    "产品经理", "项目管理", "数据分析", "产品运营", "研发", "运营",
    "截止日期", "截止", "能力差距", "能力", "项目", "简历", "Offer"
  ].filter((term) => normalized.includes(term));
  const tokens = normalized
    .normalize("NFKC")
    .split(/[\s,，。.!！?？:：;；()[\]{}"“”'‘’/\\|]+|(?:请|帮我|我|的|哪些|哪个|比较|一下|目前|适合|优先|和|与|及)/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 3 &&
        !/^(?:OR|AND|NOT)$/i.test(token)
    );
  return [...new Set([...domainTerms, ...tokens])].slice(0, 16);
}

export function selectVerifiedCitations(
  ids: string[],
  allowed: AssistantCitation[]
): AssistantCitation[] {
  const byId = new Map(allowed.map((citation) => [citation.id, citation]));
  const selected: AssistantCitation[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const citation = byId.get(id);
    if (!citation) continue;
    seen.add(id);
    selected.push(citation);
  }
  return selected;
}

export function trimToCharacterBudget(text: string, budget: number): string {
  if (!Number.isFinite(budget) || budget < 0) return "";
  return Array.from(text).slice(0, Math.floor(budget)).join("");
}

export function readableCitationSnippet(text: string, limit = 260): string {
  return Array.from(
    text
      .replace(/[\[\]"]/g, "")
      .replace(/","/g, "；")
      .replace(/\s+/g, " ")
      .trim()
  ).slice(0, limit).join("");
}

const transitions: Record<AssistantMessageStatus, AssistantMessageStatus[]> = {
  streaming: ["completed", "stopped", "failed"],
  completed: [],
  stopped: [],
  failed: []
};

export function transitionMessageStatus(
  current: AssistantMessageStatus,
  next: AssistantMessageStatus
): AssistantMessageStatus {
  if (!transitions[current].includes(next)) {
    throw new Error("无效的消息状态变化");
  }
  return next;
}

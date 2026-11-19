import {
  parseExtractionResponse,
  type JobExtraction
} from "../shared/extraction";

export type AIProviderConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
  allowLocalHttp?: boolean;
};

export type ProfileForMatch = {
  summary: string;
  skills: string[];
  experiences: string[];
  strengths: string[];
  gaps: string[];
};

export type VisionImage = {
  mimeType: string;
  bytes: Uint8Array;
};

export function validateAIEndpoint(
  baseUrl: string,
  allowLocalHttp = false
): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("AI 接口地址无效");
  }

  if (url.username || url.password || url.hash) {
    throw new Error("AI 接口地址不能包含账号、密码或片段");
  }

  const isLocal =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "::1";
  if (url.protocol !== "https:" && !(allowLocalHttp && isLocal)) {
    throw new Error("AI 接口必须使用 HTTPS");
  }
  if (url.protocol === "http:" && !isLocal) {
    throw new Error("AI 接口必须使用 HTTPS");
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, "")}${url.search}`;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function sanitizeProfileForAI(
  raw: Record<string, unknown>
): ProfileForMatch {
  return {
    summary: typeof raw.summary === "string" ? raw.summary.trim() : "",
    skills: stringArray(raw.skills),
    experiences: stringArray(raw.experiences),
    strengths: stringArray(raw.strengths),
    gaps: stringArray(raw.gaps)
  };
}

export function buildExtractionPrompt(
  categories: string[],
  profile: ProfileForMatch
): string {
  return `你是岗位信息整理助手。请把同一岗位的多张截图当作一份完整 JD 阅读，合并跨图内容并去重。

岗位分类只能从以下名称中选择最接近的一项：${categories.join("、")}。
截图中看不清、被遮挡或没有出现的信息必须返回 null 或空数组，不得猜测，不得补造公司、地点、薪资、学历或经历。
薪资必须按截图原文保留（例如“15-25K·14薪”“面议”），不要换算或自行补全。
职责与要求优先保留原意，可适度压缩成短句。能力标签分为硬技能、通用能力和经验要求。
匹配分析只依据下方能力档案，给出 high、medium 或 low；优势和缺口都要有档案或 JD 依据，不制造百分比。

能力档案（不含身份与联系方式）：
${JSON.stringify(profile)}

必须返回 JSON，不要使用 Markdown，也不要附加解释。JSON 结构必须为：
{
  "company": string | null,
  "title": string | null,
  "location": string | null,
  "salary": string | null,
  "categoryName": string,
  "responsibilities": string[],
  "requirements": string[],
  "abilities": {
    "hard": string[],
    "general": string[],
    "experience": string[]
  },
  "match": {
    "level": "high" | "medium" | "low",
    "strengths": string[],
    "gaps": string[],
    "evidence": string[]
  },
  "missingFields": string[]
}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function readMessageContent(payload: unknown): string {
  const content = (
    payload as {
      choices?: Array<{ message?: { content?: unknown } }>;
    }
  )?.choices?.[0]?.message?.content;

  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) =>
        item &&
        typeof item === "object" &&
        "text" in item &&
        typeof item.text === "string"
          ? item.text
          : ""
      )
      .join("");
  }
  throw new Error("模型响应中没有文本内容");
}

export async function requestCompletion(
  config: AIProviderConfig,
  messages: unknown[],
  fetchImpl: typeof fetch
): Promise<string> {
  const validatedEndpoint = validateAIEndpoint(
    config.baseUrl,
    config.allowLocalHttp ?? false
  );
  const endpointUrl = new URL(validatedEndpoint);
  if (/\/v1\/?$/i.test(endpointUrl.pathname)) {
    endpointUrl.pathname = endpointUrl.pathname.replace(
      /\/v1\/?$/i,
      "/v1/chat/completions"
    );
  } else if (!/\/chat\/completions\/?$/i.test(endpointUrl.pathname)) {
    endpointUrl.pathname = `${endpointUrl.pathname.replace(/\/+$/, "")}/chat/completions`;
  }
  const endpoint = endpointUrl.toString();
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      messages
    })
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`模型请求失败（${response.status}）：${detail}`);
  }

  return readMessageContent(await response.json());
}

export async function extractWithVision(input: {
  config: AIProviderConfig;
  categories: string[];
  profile: ProfileForMatch;
  images: VisionImage[];
  fetchImpl?: typeof fetch;
}): Promise<JobExtraction> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const prompt = buildExtractionPrompt(input.categories, input.profile);
  const messages = [
    {
      role: "system",
      content: "你只返回符合指定结构的 JSON，不输出 Markdown 或额外说明。"
    },
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        ...input.images.map((image) => ({
          type: "image_url",
          image_url: {
            url: `data:${image.mimeType};base64,${bytesToBase64(image.bytes)}`
          }
        }))
      ]
    }
  ];

  const firstResponse = await requestCompletion(
    input.config,
    messages,
    fetchImpl
  );
  try {
    return parseExtractionResponse(firstResponse);
  } catch {
    const repairMessages = [
      {
        role: "system",
        content: "你只返回符合指定结构的 JSON，不输出 Markdown 或额外说明。"
      },
      {
        role: "user",
        content: `原始任务要求：\n${prompt}\n\n上一次回答：\n${firstResponse}\n\n请修复为完整、有效的 JSON。不要重新分析图片，不要省略任何字段。`
      }
    ];
    return parseExtractionResponse(
      await requestCompletion(input.config, repairMessages, fetchImpl)
    );
  }
}

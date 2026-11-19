import { describe, expect, it, vi } from "vitest";

import {
  buildExtractionPrompt,
  extractWithVision,
  sanitizeProfileForAI,
  validateAIEndpoint
} from "../src/worker/ai";

const extraction = {
  company: "示例科技",
  title: "AI 产品经理",
  location: "成都",
  salary: "15-25K·14薪",
  categoryName: "产品",
  responsibilities: ["负责 AI 产品规划"],
  requirements: ["本科及以上学历"],
  abilities: {
    hard: ["产品规划"],
    general: ["沟通"],
    experience: ["AI 产品经验"]
  },
  match: {
    level: "medium",
    strengths: ["项目管理"],
    gaps: ["产品案例"],
    evidence: ["负责过跨团队项目"]
  },
  missingFields: []
};

function chatResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }]
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("AI endpoint validation", () => {
  it("accepts HTTPS and strips a trailing slash", () => {
    expect(
      validateAIEndpoint("https://gateway.example.com/v1/chat/completions/")
    ).toBe("https://gateway.example.com/v1/chat/completions");
  });

  it("rejects remote HTTP endpoints", () => {
    expect(() => validateAIEndpoint("http://example.com/v1")).toThrow(
      "AI 接口必须使用 HTTPS"
    );
  });

  it("allows localhost HTTP only when explicitly enabled", () => {
    expect(validateAIEndpoint("http://127.0.0.1:9090/v1", true)).toBe(
      "http://127.0.0.1:9090/v1"
    );
    expect(() => validateAIEndpoint("http://127.0.0.1:9090/v1")).toThrow(
      "AI 接口必须使用 HTTPS"
    );
  });
});

describe("profile sanitization", () => {
  it("keeps matching fields and excludes identity and contact details", () => {
    const result = sanitizeProfileForAI({
      name: "吴同学",
      phone: "18800000000",
      email: "private@example.com",
      summary: "微电子本科生",
      skills: ["数据分析", "项目管理"],
      experiences: ["负责跨团队项目"],
      strengths: ["沟通"],
      gaps: ["缺少产品实习"],
      unrelated: "不应发送"
    });

    expect(result).toEqual({
      summary: "微电子本科生",
      skills: ["数据分析", "项目管理"],
      experiences: ["负责跨团队项目"],
      strengths: ["沟通"],
      gaps: ["缺少产品实习"]
    });
    expect(JSON.stringify(result)).not.toContain("private@example.com");
    expect(JSON.stringify(result)).not.toContain("18800000000");
  });
});

describe("extraction prompt", () => {
  it("includes categories and a strict no-fabrication instruction", () => {
    const prompt = buildExtractionPrompt(
      ["研发", "产品", "运营"],
      sanitizeProfileForAI({
        summary: "微电子本科生",
        skills: ["项目管理"],
        experiences: [],
        strengths: [],
        gaps: []
      })
    );

    expect(prompt).toContain("研发、产品、运营");
    expect(prompt).toContain("不得猜测");
    expect(prompt).toContain("返回 JSON");
    expect(prompt).toContain("薪资");
  });
});

describe("extractWithVision", () => {
  const config = {
    baseUrl: "https://gateway.example.com/v1/chat/completions",
    model: "vision-model",
    apiKey: "secret-key"
  };
  const profile = sanitizeProfileForAI({
    summary: "微电子本科生",
    skills: ["项目管理"],
    experiences: [],
    strengths: [],
    gaps: []
  });
  const images = [
    { mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) }
  ];

  it("returns parsed extraction from one successful model call", async () => {
    const fetchImpl = vi.fn(async () =>
      chatResponse(`\`\`\`json\n${JSON.stringify(extraction)}\n\`\`\``)
    );

    await expect(
      extractWithVision({
        config,
        categories: ["产品"],
        profile,
        images,
        fetchImpl
      })
    ).resolves.toEqual(extraction);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const request = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(request.headers).toMatchObject({
      Authorization: "Bearer secret-key"
    });
    expect(String(request.body)).toContain("data:image/png;base64,AQID");
  });

  it("performs exactly one repair call after invalid JSON", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(chatResponse("这不是 JSON"))
      .mockResolvedValueOnce(chatResponse(JSON.stringify(extraction)));

    await expect(
      extractWithVision({
        config,
        categories: ["产品"],
        profile,
        images,
        fetchImpl
      })
    ).resolves.toEqual(extraction);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("appends the chat completions path when given an API v1 base URL", async () => {
    const fetchImpl = vi.fn(async () =>
      chatResponse(JSON.stringify(extraction))
    );
    await extractWithVision({
      config: {
        ...config,
        baseUrl: "https://gateway.example.com/v1"
      },
      categories: ["产品"],
      profile,
      images,
      fetchImpl
    });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://gateway.example.com/v1/chat/completions"
    );
  });
});

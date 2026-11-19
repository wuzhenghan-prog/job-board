import { describe, expect, it } from "vitest";

import {
  buildDiscoveryQueries,
  buildRecommendationFingerprint,
  matchesDiscoveryHardFilters,
  normalizeDiscoveryUrl,
  parseMonthlySalaryK,
  parseDiscoveryModelResponse,
  validateDiscoveryPreferences
} from "../src/shared/discovery";

const preferences = {
  targetTitles: ["产品经理", "数据产品"],
  categoryIds: ["product", "data"],
  categoryNames: ["产品", "数据"],
  locations: ["成都", "远程"],
  remoteAllowed: true,
  salaryFloorK: 15,
  experienceLevel: "实习/初级",
  includeKeywords: ["AI"],
  excludeKeywords: ["销售"],
  enabled: true
};

describe("automatic job discovery domain", () => {
  it("validates usable discovery preferences", () => {
    expect(validateDiscoveryPreferences(preferences).targetTitles).toEqual([
      "产品经理",
      "数据产品"
    ]);
    expect(() =>
      validateDiscoveryPreferences({
        ...preferences,
        targetTitles: [],
        categoryNames: [],
        categoryIds: []
      })
    ).toThrow("至少填写一个目标岗位或选择分类");
  });

  it("builds at most four focused public search queries", () => {
    const queries = buildDiscoveryQueries(preferences);
    expect(queries).toHaveLength(4);
    expect(queries.join(" ")).toContain("产品经理");
    expect(queries.join(" ")).toContain("成都");
    expect(queries.join(" ")).toContain("AI");
  });

  it("normalizes tracking URLs while preserving stable job identity", () => {
    expect(
      normalizeDiscoveryUrl(
        "https://jobs.example.com/role/123/?utm_source=bing&ref=feed#apply"
      )
    ).toBe("https://jobs.example.com/role/123");
  });

  it("parses common monthly salary ranges and keeps ambiguous formats unknown", () => {
    expect(parseMonthlySalaryK("15-25K·14薪")).toMatchObject({
      minK: 15,
      maxK: 25,
      known: true
    });
    expect(parseMonthlySalaryK("月薪 15000-25000 元")).toMatchObject({
      minK: 15,
      maxK: 25,
      known: true
    });
    expect(parseMonthlySalaryK("年薪 20-30 万")).toMatchObject({
      known: false
    });
    expect(parseMonthlySalaryK("面议")).toMatchObject({ known: false });
  });

  it("applies target and location hard filters conservatively", () => {
    expect(
      matchesDiscoveryHardFilters(
        {
          title: "AI 产品经理",
          location: "成都",
          text: "负责 AI 数据产品和需求分析"
        },
        preferences
      )
    ).toBe(true);
    expect(
      matchesDiscoveryHardFilters(
        {
          title: "销售经理",
          location: "成都",
          text: "负责渠道销售"
        },
        preferences
      )
    ).toBe(false);
    expect(
      matchesDiscoveryHardFilters(
        {
          title: "产品经理",
          location: "北京",
          text: "不能远程"
        },
        preferences
      )
    ).toBe(false);
  });

  it("creates a stable company-title-location fingerprint", () => {
    expect(
      buildRecommendationFingerprint({
        company: "星河 科技",
        title: "数据产品实习生",
        location: "成都"
      })
    ).toBe("星河科技|数据产品实习生|成都");
  });

  it("parses a strict bounded recommendation list from the model", () => {
    expect(
      parseDiscoveryModelResponse(
        `\`\`\`json\n${JSON.stringify({
          recommendations: [
            {
              candidateId: "candidate-1",
              isJob: true,
              title: "数据产品实习生",
              company: "星河科技",
              location: "成都",
              salary: "15-20K",
              remote: false,
              categoryName: "产品",
              responsibilities: ["需求分析"],
              requirements: ["本科"],
              abilities: { hard: ["数据分析"], general: ["沟通"], experience: [] },
              match: {
                level: "high",
                score: 86,
                strengths: ["数据分析"],
                gaps: ["产品案例"],
                evidence: ["能力档案包含数据分析"]
              },
              missingFields: []
            }
          ]
        })}\n\`\`\``
      ).recommendations
    ).toHaveLength(1);
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  buildDiscoveryModelPrompt,
  parseJobPostingJsonLd,
  runDiscoveryPipeline,
  type DiscoveryPageSource
} from "../src/worker/discoveryPipeline";

const preferences = {
  targetTitles: ["数据产品"],
  categoryIds: ["product"],
  categoryNames: ["产品"],
  locations: ["成都"],
  remoteAllowed: false,
  salaryFloorK: 15,
  experienceLevel: "实习/初级",
  includeKeywords: ["AI"],
  excludeKeywords: ["销售"],
  enabled: true
};

const profile = {
  summary: "微电子本科生，准备求职数据产品",
  skills: ["数据分析", "项目管理"],
  experiences: ["负责跨团队项目"],
  strengths: ["结构化表达"],
  gaps: ["缺少平台实习"]
};

const page: DiscoveryPageSource = {
  sourceUrl: "https://jobs.example.com/product",
  canonicalUrl: "https://jobs.example.com/product",
  sourceDomain: "jobs.example.com",
  sourceTitle: "数据产品实习生",
  snippet: "AI 数据产品",
  title: "数据产品实习生",
  company: "星河科技",
  location: "成都",
  salary: "15-20K",
  description: "负责 AI 数据产品需求分析和指标设计",
  postedAt: null,
  validThrough: "2026-12-31"
};

describe("discovery pipeline", () => {
  it("parses schema.org JobPosting JSON-LD", () => {
    const html = `<html><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "数据产品实习生",
      hiringOrganization: { "@type": "Organization", name: "星河科技" },
      jobLocation: { "@type": "Place", address: { addressLocality: "成都" } },
      description: "<p>负责 AI 数据产品需求分析和指标设计。</p>",
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "CNY",
        value: { minValue: 15000, maxValue: 20000, unitText: "MONTH" }
      },
      datePosted: "2026-11-14",
      validThrough: "2026-12-31"
    })}</script></html>`;
    expect(
      parseJobPostingJsonLd(html, "https://jobs.example.com/1")
    ).toMatchObject({
      title: "数据产品实习生",
      company: "星河科技",
      location: "成都",
      salary: "15000-20000 CNY / MONTH",
      validThrough: "2026-12-31"
    });
  });

  it("builds a bounded read-only scoring prompt", () => {
    const prompt = buildDiscoveryModelPrompt(preferences, profile, [
      {
        candidateId: "candidate-1",
        sourceUrl: "https://jobs.example.com/1",
        canonicalUrl: "https://jobs.example.com/1",
        sourceDomain: "jobs.example.com",
        sourceTitle: "数据产品实习生",
        snippet: "AI 数据产品岗位",
        title: "数据产品实习生",
        company: "星河科技",
        location: "成都",
        salary: "15-20K",
        description: "负责 AI 数据产品需求分析和指标设计",
        postedAt: null,
        validThrough: null
      }
    ]);
    expect(prompt).toContain("最多返回 10 条");
    expect(prompt).toContain("不得创建岗位");
    expect(prompt).toContain("candidate-1");
  });

  it("filters candidates and calls the model once with at most ten results", async () => {
    const pages: DiscoveryPageSource[] = [
      {
        sourceUrl: "https://jobs.example.com/product",
        canonicalUrl: "https://jobs.example.com/product",
        sourceDomain: "jobs.example.com",
        sourceTitle: "数据产品实习生",
        snippet: "AI 数据产品",
        title: "数据产品实习生",
        company: "星河科技",
        location: "成都",
        salary: "15-20K",
        description: "负责 AI 数据产品需求分析和指标设计",
        postedAt: null,
        validThrough: "2026-12-31"
      },
      {
        sourceUrl: "https://jobs.example.com/sales",
        canonicalUrl: "https://jobs.example.com/sales",
        sourceDomain: "jobs.example.com",
        sourceTitle: "销售经理",
        snippet: "渠道销售",
        title: "销售经理",
        company: "示例公司",
        location: "成都",
        salary: "20-30K",
        description: "负责渠道销售",
        postedAt: null,
        validThrough: null
      }
    ];
    const model = vi.fn(async () => ({
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
            level: "high" as const,
            score: 88,
            strengths: ["数据分析"],
            gaps: ["产品案例"],
            evidence: ["能力档案包含数据分析"]
          },
          missingFields: []
        }
      ]
    }));
    const result = await runDiscoveryPipeline({
      preferences,
      profile,
      pages,
      now: new Date("2026-11-15T00:00:00.000Z"),
      model
    });
    expect(model).toHaveBeenCalledTimes(1);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].sourceUrl).toBe("https://jobs.example.com/product");
    expect(result.funnel).toEqual({
      inputCount: 2,
      hardFilteredCount: 1,
      modelExcludedCount: 0
    });
  });

  it("does not call the model when no page passes hard filters", async () => {
    const model = vi.fn();
    const result = await runDiscoveryPipeline({
      preferences,
      profile,
      pages: [],
      now: new Date("2026-11-15T00:00:00.000Z"),
      model
    });
    expect(result.drafts).toEqual([]);
    expect(result.funnel).toEqual({
      inputCount: 0,
      hardFilteredCount: 0,
      modelExcludedCount: 0
    });
    expect(model).not.toHaveBeenCalled();
  });

  it("counts candidates the model omitted from its response as excluded", async () => {
    const model = vi.fn(async () => ({ recommendations: [] }));
    const result = await runDiscoveryPipeline({
      preferences,
      profile,
      pages: [page],
      now: new Date("2026-11-15T00:00:00.000Z"),
      model
    });
    expect(result.drafts).toEqual([]);
    expect(result.funnel).toEqual({
      inputCount: 1,
      hardFilteredCount: 1,
      modelExcludedCount: 1
    });
  });

  it("applies the salary floor to model-enriched salaries", async () => {
    const model = vi.fn(async () => ({
      recommendations: [
        {
          candidateId: "candidate-1",
          isJob: true,
          title: "数据产品实习生",
          company: "星河科技",
          location: "成都",
          salary: "8-10K",
          remote: false,
          categoryName: "产品",
          responsibilities: [],
          requirements: [],
          abilities: { hard: [], general: [], experience: [] },
          match: {
            level: "low" as const,
            score: 35,
            strengths: [],
            gaps: [],
            evidence: []
          },
          missingFields: []
        }
      ]
    }));
    const result = await runDiscoveryPipeline({
      preferences,
      profile,
      pages: [page],
      now: new Date("2026-11-15T00:00:00.000Z"),
      model
    });
    expect(result.drafts).toEqual([]);
    expect(result.funnel).toEqual({
      inputCount: 1,
      hardFilteredCount: 1,
      modelExcludedCount: 1
    });
  });

  it("drops pages that explicitly say the job is closed", async () => {
    const model = vi.fn();
    const result = await runDiscoveryPipeline({
      preferences,
      profile,
      pages: [
        {
          ...page,
          description: "该职位已暂停招聘，正在推荐其他职位"
        }
      ],
      now: new Date("2026-11-15T00:00:00.000Z"),
      model
    });
    expect(result.drafts).toEqual([]);
    expect(model).not.toHaveBeenCalled();
  });
});

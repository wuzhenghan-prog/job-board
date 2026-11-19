// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import Library from "../src/components/Library";
import type { Opportunity } from "../src/types";

vi.mock("../src/api", () => ({
  api: vi.fn(async () =>
    [
      {
        id: "long-1",
        company: "Northwind Industries Holdings International Services",
        title: "全球供应链数字化与人工智能产品运营负责人（跨境业务增长策略与客户体验方向）",
        location: "北京、上海、深圳、杭州、成都",
        salary: "20-35K·15薪",
        categoryId: "operations",
        categoryName: "运营",
        stage: "to_evaluate",
        responsibilities: [],
        requirements: [],
        abilities: {
          hard: [
            "跨文化跨团队项目交付与国际客户沟通",
            "数据分析"
          ],
          general: [],
          experience: []
        },
        match: {
          level: "medium",
          strengths: [],
          gaps: [],
          evidence: []
        },
        deadline: null,
        sourceUrl: null,
        notes: null,
        version: 1,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
        images: [],
        interviewRounds: [],
        statusHistory: []
      }
    ] as Opportunity[]
  )
}));

describe("long opportunity content", () => {
  it("renders a realistic long title without dropping the delete action", async () => {
    render(
      <MemoryRouter>
        <Library categories={[]} onCategoriesChanged={() => {}} />
      </MemoryRouter>
    );
    expect(
      await screen.findByText("全球供应链数字化与人工智能产品运营负责人（跨境业务增长策略与客户体验方向）")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /删除 全球供应链数字化与人工智能产品运营负责人/
      })
    ).toBeInTheDocument();
    expect(screen.getByText("20-35K·15薪")).toBeInTheDocument();
  });

});

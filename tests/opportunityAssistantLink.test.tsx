// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import OpportunityDetail from "../src/components/OpportunityDetail";

vi.mock("../src/api", () => ({
  api: vi.fn(async () => ({
    id: "ai-test",
    company: "示例科技",
    title: "产品实习生",
    location: "成都",
    categoryId: "product",
    categoryName: "产品",
    stage: "to_evaluate",
    responsibilities: ["分析需求"],
    requirements: ["本科"],
    abilities: { hard: ["数据分析"], general: [], experience: [] },
    match: { level: "medium", strengths: [], gaps: [], evidence: [] },
    deadline: null,
    sourceUrl: null,
    notes: null,
    version: 1,
    createdAt: "2026-11-15T00:00:00.000Z",
    updatedAt: "2026-11-15T00:00:00.000Z",
    images: [],
    interviewRounds: [],
    statusHistory: []
  }))
}));

describe("opportunity assistant entry", () => {
  it("links the current opportunity to a read-only assistant conversation", async () => {
    render(
      <MemoryRouter initialEntries={["/opportunities/ai-test"]}>
        <Routes>
          <Route path="/opportunities/:id" element={<OpportunityDetail categories={[]} />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByRole("link", { name: "询问 AI" })).toHaveAttribute(
      "href",
      "/assistant/new?opportunity=ai-test"
    );
  });
});

// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import Library from "../src/components/Library";

const state = vi.hoisted(() => ({ configured: false, withSourceUrl: true }));

afterEach(cleanup);

vi.mock("../src/api", () => ({
  api: vi.fn(async (path: string) => {
    if (path === "/api/discovery") {
      const preference = state.configured
        ? {
            targetTitles: ["数据产品"],
            categoryIds: ["product"],
            categoryNames: ["产品"],
            locations: ["成都"],
            remoteAllowed: true,
            salaryFloorK: 15,
            experienceLevel: "实习/初级",
            includeKeywords: ["AI"],
            excludeKeywords: ["销售"],
            enabled: true
          }
        : {
            targetTitles: [],
            categoryIds: [],
            categoryNames: [],
            locations: [],
            remoteAllowed: false,
            salaryFloorK: null,
            experienceLevel: "",
            includeKeywords: [],
            excludeKeywords: [],
            enabled: false
          };
      return {
        preferences: preference,
        lastRun: state.configured
          ? {
              id: "run-1",
              triggerType: "manual",
              status: "completed",
              candidateCount: 12,
              hardFilteredCount: 4,
              modelExcludedCount: 1,
              recommendationCount: 1,
              error: null,
              createdAt: "2026-11-15T00:00:00.000Z",
              startedAt: "2026-11-15T00:00:01.000Z",
              completedAt: "2026-11-15T00:00:02.000Z"
            }
          : null,
        recommendations: state.configured
          ? [
              {
                id: "rec-1",
                runId: "run-1",
                sourceUrl: state.withSourceUrl ? "https://jobs.example.com/1" : "",
                canonicalUrl: "https://jobs.example.com/1",
                sourceDomain: "jobs.example.com",
                sourceTitle: "数据产品实习生",
                snippet: "AI 数据产品岗位",
                fingerprint: "星河科技|数据产品实习生|成都",
                title: "数据产品实习生",
                company: "星河科技",
                location: "成都",
                salary: "15-20K",
                salaryMinK: 15,
                salaryMaxK: 20,
                salaryKnown: true,
                categoryName: "产品",
                responsibilities: ["需求分析"],
                requirements: ["本科"],
                abilities: { hard: ["数据分析"], general: ["沟通"], experience: [] },
                match: {
                  level: "high",
                  score: 88,
                  strengths: ["数据分析"],
                  gaps: ["产品案例"],
                  evidence: ["能力档案包含数据分析"]
                },
                missingFields: [],
                sourcePostedAt: null,
                sourceValidThrough: null,
                state: "new",
                savedOpportunityId: null,
                discoveredAt: "2026-11-15T00:00:00.000Z",
                expiresAt: "2026-12-15T00:00:00.000Z"
              }
            ]
          : [],
        manualRunsToday: state.configured ? 1 : 0,
        manualRunLimit: 3,
        canRunNow: state.configured
      };
    }
    if (path.startsWith("/api/opportunities")) return [];
    return [];
  })
}));

describe("discovery library view", () => {
  it("shows the discovery view inside the library and asks for preferences first", async () => {
    state.configured = false;
    render(
      <MemoryRouter initialEntries={["/library?view=discovery"]}>
        <Library categories={[]} onCategoriesChanged={() => {}} />
      </MemoryRouter>
    );
    expect(await screen.findByRole("heading", { name: "发现推荐" })).toBeInTheDocument();
    expect(screen.getByText(/先配置求职偏好/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "我的岗位" })[0]).toHaveAttribute(
      "href",
      "/library"
    );
  });

  it("renders recommendation evidence and the review action", async () => {
    state.configured = true;
    state.withSourceUrl = true;
    render(
      <MemoryRouter initialEntries={["/library?view=discovery"]}>
        <Library categories={[]} onCategoriesChanged={() => {}} />
      </MemoryRouter>
    );
    expect(await screen.findByRole("heading", { name: "数据产品实习生" })).toBeInTheDocument();
    expect(screen.getByText(/15-20K/)).toBeInTheDocument();
    expect(screen.getByText("数据分析")).toBeInTheDocument();
    expect(screen.queryAllByText("候选数").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "保存到岗位库" })).toHaveAttribute(
      "href",
      "/library/discovery/rec-1/save"
    );
    const applyLink = screen.getByRole("link", { name: "前往平台投递" });
    expect(applyLink).toHaveAttribute("href", "https://jobs.example.com/1");
    expect(applyLink).toHaveAttribute("target", "_blank");
    expect(applyLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("hides the apply action when a recommendation has no source URL", async () => {
    state.configured = true;
    state.withSourceUrl = false;
    render(
      <MemoryRouter initialEntries={["/library?view=discovery"]}>
        <Library categories={[]} onCategoriesChanged={() => {}} />
      </MemoryRouter>
    );
    expect(await screen.findByRole("heading", { name: "数据产品实习生" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "前往平台投递" })).not.toBeInTheDocument();
  });
});

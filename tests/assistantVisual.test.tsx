// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import Composer from "../src/components/assistant/Composer";
import DocumentLibrary from "../src/components/assistant/DocumentLibrary";
import MessageList from "../src/components/assistant/MessageList";
import type { AssistantMessage } from "../src/types";

vi.mock("../src/api", () => ({
  api: vi.fn(async () => [])
}));

describe("assistant UI", () => {
  it("shows the read-only and quota boundary in the composer", () => {
    render(
      <Composer
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        onStop={() => {}}
        streaming={false}
        disabled={false}
        usage={{ used: 3, limit: 50 }}
        webEnabled={false}
        onToggleWeb={() => {}}
      />
    );
    expect(screen.getByText("今日问答 3/50")).toBeInTheDocument();
    expect(screen.getByText(/AI 只读，不会修改岗位数据/)).toBeInTheDocument();
    expect(screen.getByLabelText("向 AI 助理提问")).toBeInTheDocument();
  });

  it("renders citations and failed-answer retry", () => {
    const messages: AssistantMessage[] = [
      {
        id: "a1",
        conversationId: "c1",
        role: "assistant",
        content: "这是一条未完成的回答。",
        status: "stopped",
        attempt: 1,
        replacesMessageId: null,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        citations: [
          {
            id: "opportunity:1",
            type: "opportunity",
            sourceId: "1",
            title: "产品实习生",
            snippet: "负责产品规划",
            url: "/opportunities/1"
          }
        ]
      }
    ];
    render(
      <MemoryRouter>
        <MessageList messages={messages} onRetry={() => {}} onCopy={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText("已停止生成")).toBeInTheDocument();
    expect(screen.getByText("产品实习生")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("shows the document empty state and privacy guidance", async () => {
    render(
      <MemoryRouter>
        <DocumentLibrary />
      </MemoryRouter>
    );
    expect(
      screen.getByText(/上传前请遮盖身份证、手机号、住址等敏感信息/)
    ).toBeInTheDocument();
    expect(await screen.findByText(/还没有资料/)).toBeInTheDocument();
  });
});

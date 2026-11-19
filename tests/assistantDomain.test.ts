import { describe, expect, it } from "vitest";

import {
  buildConversationTitle,
  buildSearchPhrases,
  redactContactLines,
  selectVerifiedCitations,
  transitionMessageStatus,
  trimToCharacterBudget,
  type AssistantCitation
} from "../src/shared/assistant";

describe("assistant domain", () => {
  it("creates a concise editable title from the first question", () => {
    expect(
      buildConversationTitle("请帮我比较一下最近值得优先投递的高匹配产品岗位可以吗")
    ).toBe("比较一下最近值得优先投递的高匹配产品岗位");
  });

  it("redacts contact lines without removing job-relevant body text", () => {
    const text = [
      "姓名：吴同学",
      "手机：18800000000",
      "邮箱：private@example.com",
      "负责数据分析与产品运营",
      "每周可到岗四天"
    ].join("\n");

    expect(redactContactLines(text)).toBe(
      ["负责数据分析与产品运营", "每周可到岗四天"].join("\n")
    );
  });

  it("builds valid trigram phrases and drops short tokens and operators", () => {
    expect(buildSearchPhrases("数据分析 OR 运营 产品运营 SQL")).toEqual([
      "数据分析",
      "产品运营",
      "运营",
      "SQL"
    ]);
    expect(buildSearchPhrases("AI 运营")).toEqual(["运营"]);
  });

  it("extracts useful short phrases from a natural Chinese question", () => {
    const phrases = buildSearchPhrases(
      "请比较我目前的高匹配岗位，哪些适合优先投递和准备面试？"
    );
    expect(phrases).toContain("高匹配");
    expect(phrases).toContain("面试");
    expect(phrases.length).toBeLessThanOrEqual(16);
  });

  it("only accepts citations supplied to this request", () => {
    const allowed: AssistantCitation[] = [
      {
        id: "opportunity:1",
        type: "opportunity",
        sourceId: "1",
        title: "产品实习生",
        snippet: "负责产品规划",
        url: "/opportunities/1"
      },
      {
        id: "document:2",
        type: "document",
        sourceId: "2",
        title: "能力档案",
        snippet: "数据分析",
        url: "/assistant/documents/2"
      }
    ];

    expect(
      selectVerifiedCitations(
        ["document:2", "opportunity:404", "document:2"],
        allowed
      )
    ).toEqual([allowed[1]]);
  });

  it("allows only supported message state transitions", () => {
    expect(transitionMessageStatus("streaming", "completed")).toBe("completed");
    expect(transitionMessageStatus("streaming", "stopped")).toBe("stopped");
    expect(transitionMessageStatus("streaming", "failed")).toBe("failed");
    expect(() => transitionMessageStatus("completed", "stopped")).toThrow(
      "无效的消息状态变化"
    );
  });

  it("trims context without splitting a Unicode character", () => {
    expect(trimToCharacterBudget("😀岗位分析", 3)).toBe("😀岗位");
    expect(trimToCharacterBudget("岗位分析", 20)).toBe("岗位分析");
  });
});

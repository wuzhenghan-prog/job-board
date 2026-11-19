import { describe, expect, it } from "vitest";

import {
  detectProfileFileKind,
  parseCareerProfileMarkdown,
  parseProfileText
} from "../src/profileImport";

describe("career profile Markdown import", () => {
  it("extracts matching fields but never imports contact identity", () => {
    const profile = parseCareerProfileMarkdown(`# Career Profile

## 2. Headline & target roles
- 目标角色：项目管理

## 3. Summary
微电子本科生，偏向 AI 应用与项目交付。

## 4. Experience snapshot
- 2025.05 至今：IGBT 项目负责人
- 2025.07：RFID 测试实习

## 8. Technical skills
- C、Verilog、Silvaco TCAD
- 测试数据采集与异常定位

## 10. Leadership & people
- 团队协调与跨团队沟通

## 18. Known gaps
- 缺少大型客户交付经验

## 19. Pre-built framings
- 不写入联系方式

电话：18800000000
邮箱：private@example.com
`);
    expect(profile.summary).toContain("微电子本科生");
    expect(profile.skills).toContain("C、Verilog、Silvaco TCAD");
    expect(profile.experiences).toContain("2025.05 至今：IGBT 项目负责人");
    expect(profile.strengths).toContain("团队协调与跨团队沟通");
    expect(profile.gaps).toContain("缺少大型客户交付经验");
    expect(JSON.stringify(profile)).not.toContain("18800000000");
    expect(JSON.stringify(profile)).not.toContain("private@example.com");
  });
});

describe("profile file formats", () => {
  it("recognizes Markdown, text, Word and PDF files", () => {
    expect(detectProfileFileKind("career.md")).toBe("markdown");
    expect(detectProfileFileKind("career.markdown")).toBe("markdown");
    expect(detectProfileFileKind("resume.txt")).toBe("text");
    expect(detectProfileFileKind("resume.docx")).toBe("docx");
    expect(detectProfileFileKind("resume.pdf")).toBe("pdf");
  });

  it("rejects legacy binary Word files with a clear action", () => {
    expect(() => detectProfileFileKind("resume.doc")).toThrow("另存为 .docx");
  });

  it("parses ordinary Chinese resume headings from extracted Word or PDF text", () => {
    const profile = parseProfileText(`个人简介
微电子本科生，喜欢跨团队协作和项目推进。

专业技能
- C、Verilog、Silvaco TCAD
- Python 数据分析

项目经历
- HighK-DFS RC-IGBT 结构设计与优化
- RFID 标签性能测试

个人优势
- 目标拆解与团队协调

待提升
- 缺少大型客户交付经验
`);
    expect(profile.summary).toContain("微电子本科生");
    expect(profile.skills).toContain("C、Verilog、Silvaco TCAD");
    expect(profile.experiences).toContain("HighK-DFS RC-IGBT 结构设计与优化");
    expect(profile.strengths).toContain("目标拆解与团队协调");
    expect(profile.gaps).toContain("缺少大型客户交付经验");
  });
});

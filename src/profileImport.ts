import type { Profile } from "./types";

export type ProfileFileKind = "markdown" | "text" | "docx" | "pdf";

type ProfileSection = "summary" | "skills" | "experiences" | "strengths" | "gaps";

const headingAliases: Array<[ProfileSection, string[]]> = [
  ["summary", ["summary", "profile", "aboutme", "个人简介", "个人总结", "个人概述", "个人概况", "自我评价", "职业概述", "求职意向", "简介"]],
  ["skills", ["technicalskills", "skills", "专业技能", "技能", "技能特长", "技术能力", "核心技能", "核心能力", "能力概览", "专长", "技能清单", "语言能力", "证书"]],
  ["experiences", ["experience", "workexperience", "experiencesnapshot", "工作经历", "项目经历", "实习经历", "校园经历", "科研经历", "实践经历", "教育背景", "教育经历", "教育与荣誉", "经历"]],
  ["strengths", ["leadership&people", "leadership", "people", "pre-builtframings", "个人优势", "能力优势", "优势", "能力亮点", "领导力", "荣誉奖项"]],
  ["gaps", ["knowngaps", "gaps", "待提升", "不足", "能力缺口", "需要提升"]]
];

export function detectProfileFileKind(fileName: string): ProfileFileKind {
  const extension = fileName.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? "";
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "txt") return "text";
  if (extension === "docx") return "docx";
  if (extension === "pdf") return "pdf";
  if (extension === "doc") {
    throw new Error("暂不支持旧版 .doc 文件，请在 Word 中另存为 .docx 后再导入");
  }
  throw new Error("请选择 Markdown、TXT、Word（.docx）或 PDF 文件");
}

function stripListPrefix(line: string): string {
  return line
    .replace(/^\s*(?:[-*•·]|\d+[.)、])\s*/, "")
    .replace(/^#+\s*/, "")
    .trim();
}

function headingFor(line: string): ProfileSection | null {
  const normalized = stripListPrefix(line)
    .replace(/^\d+[.)、]\s*/, "")
    .replace(/\s+/g, "")
    .replace(/[:：]\s*$/, "")
    .trim()
    .toLocaleLowerCase("en-US");
  if (!normalized || normalized.length > 32) return null;
  return headingAliases.find(([, labels]) => labels.includes(normalized))?.[0] ?? null;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isContactLine(line: string): boolean {
  return /^(电话|手机|邮箱|姓名|city|phone|email)\s*[:：]/i.test(line);
}

export function parseProfileText(text: string): Profile {
  const sections: Record<ProfileSection, string[]> = {
    summary: [],
    skills: [],
    experiences: [],
    strengths: [],
    gaps: []
  };

  let currentSection: ProfileSection | null = null;
  let foundHeading = false;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const line of lines) {
    const heading = headingFor(line);
    if (heading) {
      currentSection = heading;
      foundHeading = true;
      continue;
    }
    if (!line.trim() || isContactLine(line)) continue;
    if (currentSection) sections[currentSection].push(stripListPrefix(line));
  }

  if (!foundHeading) {
    const nonEmpty = lines.map((line) => line.trim()).filter(Boolean);
    const bulletLines = nonEmpty
      .filter((line) => /^[-*•·]/.test(line))
      .map(stripListPrefix);
    sections.summary = nonEmpty.slice(0, 12);
    sections.experiences = bulletLines.slice(0, 20);
  }

  return {
    summary: dedupe(sections.summary).join(" ").slice(0, 500),
    skills: dedupe(sections.skills),
    experiences: dedupe(sections.experiences),
    strengths: dedupe(sections.strengths),
    gaps: dedupe(sections.gaps)
  };
}

export function parseCareerProfileMarkdown(markdown: string): Profile {
  return parseProfileText(markdown);
}

async function decodeTextFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("gb18030").decode(bytes);
    } catch {
      throw new Error("文本文件编码无法识别，请另存为 UTF-8 后重试");
    }
  }
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer()
  });
  if (!result.value.trim()) {
    throw new Error("Word 文档中没有可提取的文字");
  }
  return result.value;
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({
    data: data as unknown as Uint8Array<ArrayBuffer>,
    useWorkerFetch: false
  }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .filter(
        (item): item is typeof item & { str: string; transform: number[] } =>
          "str" in item &&
          typeof item.str === "string" &&
          Array.isArray(item.transform)
      )
      .sort((left, right) => {
        const yDifference = right.transform[5] - left.transform[5];
        return Math.abs(yDifference) > 2
          ? yDifference
          : left.transform[4] - right.transform[4];
      });
    const lines: string[] = [];
    let line = "";
    let currentY: number | null = null;
    for (const item of items) {
      const y = item.transform[5];
      if (currentY === null || Math.abs(y - currentY) <= 2) {
        line = `${line} ${item.str}`.trim();
      } else {
        if (line) lines.push(line);
        line = item.str.trim();
      }
      currentY = y;
    }
    if (line) lines.push(line);
    pages.push(lines.join("\n"));
  }
  const text = pages.join("\n");
  if (text.trim().length < 20) {
    throw new Error("PDF 中没有可提取的文字；若是扫描件，请上传可复制文字的 PDF 或 Word");
  }
  return text;
}

export async function extractProfileFileText(file: File): Promise<string> {
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("能力档案文件不能超过 15MB");
  }
  const kind = detectProfileFileKind(file.name);
  if (kind === "markdown" || kind === "text") return decodeTextFile(file);
  if (kind === "docx") return extractDocxText(file);
  return extractPdfText(file);
}

import { describe, expect, it, vi } from "vitest";

import {
  extractReadableText,
  isPublicHttpUrl,
  parseBingRss,
  readPublicWebPages,
  searchPublicWeb
} from "../src/worker/assistantWeb";

describe("assistant web retrieval", () => {
  it("rejects private, local and metadata destinations", () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://localhost/",
      "http://10.0.0.1/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "file:///etc/passwd",
      "ftp://example.com/file"
    ]) {
      expect(isPublicHttpUrl(url)).toBe(false);
    }
    expect(isPublicHttpUrl("https://example.com/jobs")).toBe(true);
  });

  it("parses Bing RSS results and marks safe HTTPS links", () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>产品面试指南</title><link>https://example.com/interview</link><description>准备产品面试的公开资料</description></item><item><title>不安全链接</title><link>http://127.0.0.1/private</link><description>忽略</description></item></channel></rss>`;
    expect(parseBingRss(xml)).toEqual([
      {
        title: "产品面试指南",
        url: "https://example.com/interview",
        snippet: "准备产品面试的公开资料"
      }
    ]);
  });

  it("extracts readable text without scripts or hidden markup", () => {
    const html =
      "<html><head><title>岗位指南</title><style>.x{}</style></head><body><script>steal()</script><nav>菜单</nav><main><h1>产品经理</h1><p>负责产品规划与数据分析。</p></main></body></html>";
    expect(extractReadableText(html)).toContain("产品经理");
    expect(extractReadableText(html)).toContain("负责产品规划与数据分析");
    expect(extractReadableText(html)).not.toContain("steal");
  });

  it("uses Bing RSS first and returns no fabricated sources on failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          '<rss><channel><item><title>面试资料</title><link>https://example.com/a</link><description>摘要</description></item></channel></rss>',
          { status: 200 }
        )
      );
    const results = await searchPublicWeb({
      query: "产品面试",
      fetchImpl,
      timeoutMs: 1000
    });
    expect(results).toEqual([
      {
        title: "面试资料",
        url: "https://example.com/a",
        snippet: "摘要"
      }
    ]);
    expect(fetchImpl.mock.calls[0][0]).toContain("bing.com/search");

    fetchImpl.mockRejectedValue(new Error("offline"));
    await expect(
      searchPublicWeb({ query: "失败", fetchImpl, timeoutMs: 1000 })
    ).resolves.toEqual([]);
  });

  it("limits pages and truncates extracted body text", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("bing.com")) {
        return new Response(
          '<rss><channel><item><title>A</title><link>https://example.com/a</link><description>A</description></item><item><title>B</title><link>https://example.com/b</link><description>B</description></item><item><title>C</title><link>https://example.com/c</link><description>C</description></item><item><title>D</title><link>https://example.com/d</link><description>D</description></item></channel></rss>'
        );
      }
      return new Response(`<html><body><main>${"岗位资料".repeat(6000)}</main></body></html>`);
    });

    const pages = await readPublicWebPages({
      query: "岗位资料",
      limit: 3,
      maxCharactersPerPage: 8000,
      fetchImpl,
      timeoutMs: 1000
    });
    expect(pages).toHaveLength(3);
    expect(pages.every((page) => Array.from(page.content).length <= 8000)).toBe(true);
  });
});

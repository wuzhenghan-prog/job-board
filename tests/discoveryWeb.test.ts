import { describe, expect, it, vi } from "vitest";

import {
  collectDiscoveryPages,
  isJobDetailUrl,
  isSearchBlockedPage,
  parseLiepinListingResults,
  parseBaiduHtmlResults,
  parseBingHtmlResults,
  parseSoHtmlResults,
  parseZhaopinListingResults,
  resolveBaiduRedirectUrl,
  resolveSoRedirectUrl
} from "../src/worker/discoveryWeb";

const preferences = {
  targetTitles: ["数据产品"],
  categoryIds: ["product"],
  categoryNames: ["产品"],
  locations: ["成都"],
  remoteAllowed: false,
  salaryFloorK: 15,
  experienceLevel: "",
  includeKeywords: ["AI"],
  excludeKeywords: ["销售"],
  enabled: true
};

describe("discovery web collection", () => {
  it("recognizes captcha and security-verification pages before parsing", () => {
    expect(isSearchBlockedPage("<h4>请输入验证码以便正常访问</h4>")).toBe(true);
    expect(
      isSearchBlockedPage(
        "<html></html>",
        "https://safe.liepin.com/page/liepin/captchaPage_ip_PC"
      )
    ).toBe(true);
    expect(isSearchBlockedPage("<html>正常职位列表</html>")).toBe(false);
  });

  it("extracts concrete detail links from a public Liepin listing", () => {
    const html = `<a data-nick="job-detail-job-info" target="_blank" href="https://www.liepin.com/job/1986672707.shtml" data-promid="x"><div class="job-title-box"><div title="SiP产品经理" class="ellipsis-1">SiP产品经理</div><div class="job-dq-box"><span class="ellipsis-1">成都-高新区</span></div></div><span class="job-salary">20-30k</span></a>`;
    expect(parseLiepinListingResults(html)).toEqual([
      {
        title: "SiP产品经理",
        url: "https://www.liepin.com/job/1986672707.shtml",
        snippet: "20-30k · 成都-高新区"
      }
    ]);
  });

  it("extracts concrete detail links from a public Zhaopin listing", () => {
    const html = `<a href="https://www.zhaopin.com/jobdetail/CC120875500J40883152711.htm" title="产品经理/项目经理" target="_blank" class="vue-clamp__text job-card__name job-card__name--link">产品经理/项目经理</a>`;
    expect(parseZhaopinListingResults(html)).toEqual([
      {
        title: "产品经理/项目经理",
        url: "https://www.zhaopin.com/jobdetail/CC120875500J40883152711.htm",
        snippet: ""
      }
    ]);
  });

  it("recognizes concrete job-detail URLs and rejects listing pages", () => {
    expect(isJobDetailUrl("https://www.zhipin.com/job_detail/abc.html")).toBe(true);
    expect(isJobDetailUrl("https://jobs.bytedance.com/experienced/position/123/detail")).toBe(true);
    expect(isJobDetailUrl("https://www.zhipin.com/c101270100/?query=产品经理")).toBe(false);
    expect(isJobDetailUrl("https://www.baidu.com/s?wd=产品经理")).toBe(false);
  });

  it("resolves a Baidu redirect location to the real job URL", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("", {
        status: 302,
        headers: { location: "https://www.zhipin.com/job_detail/abc.html" }
      })
    );
    await expect(
      resolveBaiduRedirectUrl("http://www.baidu.com/link?url=abc", fetchImpl as typeof fetch)
    ).resolves.toBe("https://www.zhipin.com/job_detail/abc.html");
  });

  it("resolves a 360 redirect page to the real job URL", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('window.location.replace("https://www.zhipin.com/job_detail/xyz.html")', {
        status: 200
      })
    );
    await expect(
      resolveSoRedirectUrl("https://www.so.com/link?m=abc", fetchImpl as typeof fetch)
    ).resolves.toBe("https://www.zhipin.com/job_detail/xyz.html");
  });

  it("parses relevant links and snippets from Bing HTML results", () => {
    const html = `<ol><li class="b_algo"><h2><a href="https://jobs.example.com/1">数据产品实习生 - 星河科技</a></h2><div class="b_caption"><p>成都 AI 数据产品岗位，15-20K。</p></div></li><li class="b_algo"><h2><a href="https://jobs.example.com/2">产品经理招聘</a></h2><p>负责产品规划。</p></li></ol>`;
    expect(parseBingHtmlResults(html)).toEqual([
      {
        title: "数据产品实习生 - 星河科技",
        url: "https://jobs.example.com/1",
        snippet: "成都 AI 数据产品岗位，15-20K。"
      },
      {
        title: "产品经理招聘",
        url: "https://jobs.example.com/2",
        snippet: "负责产品规划。"
      }
    ]);
  });

  it("parses Baidu public job results without requiring a key", () => {
    const html = `<div class="result c-container"><h3 class="t"><a href="https://www.baidu.com/link?url=abc">成都产品经理招聘_成都招聘产品经理人才-猎聘</a></h3><div class="c-abstract">成都 AI 产品经理岗位，15-25K。</div></div>`;
    expect(parseBaiduHtmlResults(html)).toEqual([
      {
        title: "成都产品经理招聘_成都招聘产品经理人才-猎聘",
        url: "https://www.baidu.com/link?url=abc",
        snippet: "成都 AI 产品经理岗位，15-25K。"
      }
    ]);
  });

  it("parses 360 redirect search results with concrete job titles", () => {
    const html = `<h3><a href="https://www.so.com/link?m=abc">产品经理招聘_成都华唯科技招聘-智联招聘</a></h3><p class="res-desc">成都 AI 产品经理，15-25K。</p>`;
    expect(parseSoHtmlResults(html)).toEqual([
      {
        title: "产品经理招聘_成都华唯科技招聘-智联招聘",
        url: "https://www.so.com/link?m=abc",
        snippet: "成都 AI 产品经理，15-25K。"
      }
    ]);
  });

  it("deduplicates search results and extracts JSON-LD or readable fallback text", async () => {
    const search = vi.fn(async () => [
      {
        title: "数据产品实习生 - 星河科技",
        url: "https://jobs.example.com/job_detail/1.html?utm_source=bing",
        snippet: "AI 数据产品岗位"
      },
      {
        title: "重复岗位",
        url: "https://jobs.example.com/job_detail/1.html",
        snippet: "重复"
      }
    ]);
    const fetchPage = vi.fn(async (url: string) => ({
      html:
        url.includes("/job_detail/1")
          ? `<script type="application/ld+json">${JSON.stringify({
              "@type": "JobPosting",
              title: "数据产品实习生",
              hiringOrganization: { name: "星河科技" },
              jobLocation: { address: { addressLocality: "成都" } },
              description: "负责 AI 数据产品需求分析",
              baseSalary: { value: { minValue: 15000, maxValue: 20000 } },
              validThrough: "2026-12-31"
            })}</script>`
          : "<html><body>数据产品实习生 星河科技 成都 15-20K 负责 AI 数据分析</body></html>"
    }));

    const pages = await collectDiscoveryPages(preferences, {
      search,
      fetchPage,
      now: new Date("2026-11-15T00:00:00.000Z")
    });
    expect(search.mock.calls.length).toBeLessThanOrEqual(4);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(pages[0]).toMatchObject({
      title: "数据产品实习生",
      company: "星河科技",
      location: "成都"
    });
  });

  it("prioritizes job-detail URLs before generic results", async () => {
    const search = vi.fn(async () => [
      {
        title: "成都产品经理招聘信息汇总",
        url: "https://jobs.example.com/list?city=chengdu",
        snippet: "招聘列表"
      },
      {
        title: "AI 产品经理 - 星河科技",
        url: "https://jobs.example.com/job_detail/ai-pm.html",
        snippet: "成都 AI 产品经理"
      }
    ]);
    const fetchPage = vi.fn(async () => ({
      html: "<html><body>AI 产品经理 星河科技 成都 20-30K 负责产品规划</body></html>"
    }));
    const pages = await collectDiscoveryPages(preferences, {
      search,
      fetchPage,
      now: new Date("2026-11-15T00:00:00.000Z")
    });
    expect(pages[0].sourceUrl).toContain("job_detail");
  });

  it("reads at most twelve unique public pages within the free Worker budget", async () => {
    const search = vi.fn(async () =>
      Array.from({ length: 30 }, (_, index) => ({
        title: `数据产品岗位 ${index}`,
        url: `https://jobs.example.com/job_detail/${index}.html`,
        snippet: "成都 AI 数据产品"
      }))
    );
    const fetchPage = vi.fn(async () => ({
      html: "<html><body>数据产品实习生 成都 15-20K 负责 AI 数据分析</body></html>"
    }));
    const pages = await collectDiscoveryPages(preferences, {
      search,
      fetchPage,
      now: new Date("2026-11-15T00:00:00.000Z")
    });
    expect(pages).toHaveLength(6);
  });

  it("keeps a concrete detail result when the source page blocks body reads", async () => {
    const search = vi.fn(async () => [
      {
        title: "产品经理招聘_成都华唯科技招聘-智联招聘",
        url: "https://www.zhaopin.com/jobdetail/CC479431227J00153482203.htm",
        snippet: "成都 AI 产品经理，15-25K。"
      }
    ]);
    const fetchPage = vi.fn(async () => {
      throw new Error("403 forbidden");
    });
    const pages = await collectDiscoveryPages(preferences, {
      search,
      fetchPage,
      now: new Date("2026-11-15T00:00:00.000Z")
    });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      sourceDomain: "www.zhaopin.com",
      snippet: "成都 AI 产品经理，15-25K。"
    });
  });

  it("keeps the resolved job URL when a redirect detail page blocks body reads", async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          'window.location.replace("https://www.zhaopin.com/jobdetail/CC1.htm")'
        )
      )
    );
    const search = vi.fn(async () => [
      {
        title: "产品经理招聘_成都华唯科技招聘-智联招聘",
        url: "https://www.so.com/link?m=abc",
        snippet: "成都 AI 产品经理，15-25K。"
      }
    ]);
    const fetchPage = vi.fn(async () => {
      throw new Error("403 forbidden");
    });
    try {
      const pages = await collectDiscoveryPages(preferences, {
        search,
        fetchPage,
        now: new Date("2026-11-15T00:00:00.000Z")
      });
      expect(pages[0]).toMatchObject({
        sourceUrl: "https://www.zhaopin.com/jobdetail/CC1.htm",
        sourceDomain: "www.zhaopin.com"
      });
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });
});

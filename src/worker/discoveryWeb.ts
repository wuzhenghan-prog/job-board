import {
  buildDiscoveryQueries,
  normalizeDiscoveryUrl,
  type DiscoveryPreferences
} from "../shared/discovery";
import { trimToCharacterBudget } from "../shared/assistant";
import {
  extractReadableText,
  fetchPublicPageResponse,
  searchPublicWeb,
  type WebSearchResult
} from "./assistantWeb";
import {
  parseJobPostingJsonLd,
  type DiscoveryPageSource
} from "./discoveryPipeline";

type SearchFn = (query: string) => Promise<WebSearchResult[]>;
type FetchPageFn = (url: string) => Promise<{ html: string }>;

export function isJobDetailUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const value = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
    if (/baidu\.com\/(?:s|link|baidu\.php)/i.test(value)) return false;
    if (
      /\/job_detail\/[^/?#]+\.html?$/i.test(url.pathname) ||
      /\/job\/\d+\.shtml$/i.test(url.pathname) ||
      /\/a\/[^/?#]+\.shtml$/i.test(url.pathname) ||
      /\/jobdetail\/[^/?#]+\.html$/i.test(url.pathname) ||
      /(?:^|\/)jobdesc\.html$/i.test(url.pathname) ||
      /\/M?o?\/Job\/Detail\/[^/?#]+/i.test(url.pathname) ||
      /\/jobs?\/[^/?#]+\/[^/?#]+/i.test(url.pathname) ||
      /\/position\/[^/?#]+\/detail/i.test(url.pathname) ||
      /\/job\/\d+/i.test(url.pathname)
    ) {
      return true;
    }
    return /(?:zhipin|liepin|zhaopin|lagou|51job|jobs\.bytedance|careers\.)/i.test(url.hostname) &&
      ((/\d/.test(url.pathname) || /job|position|career|detail/i.test(url.pathname)) &&
      !/\/(?:c\d+|search|list|jobs?|career|zhaopin|wt\d+)(?:\/|$)/i.test(url.pathname));
  } catch {
    return false;
  }
}

export async function resolveBaiduRedirectUrl(
  raw: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const url = new URL(raw);
  if (!/(?:^|\.)baidu\.com$/i.test(url.hostname)) return raw;
  try {
    const response = await fetchImpl(raw, {
      method: "GET",
      redirect: "manual",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
      }
    });
    const location = response.headers.get("location");
    if (location) {
      const resolved = new URL(location, raw).toString();
      if (/^https?:\/\//i.test(resolved)) return resolved;
    }
    return response.url && response.url !== raw ? response.url : raw;
  } catch {
    return raw;
  }
}

export async function resolveSoRedirectUrl(
  raw: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const url = new URL(raw);
  if (!/(?:^|\.)so\.com$/i.test(url.hostname)) return raw;
  try {
    const response = await fetchImpl(raw, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
      }
    });
    const location = response.headers.get("location");
    if (location) {
      const resolved = new URL(location, raw).toString();
      if (/^https?:\/\//i.test(resolved)) return resolved;
    }
    if (response.url && response.url !== raw && !/so\.com/i.test(response.url)) {
      return response.url;
    }
    const html = await response.text();
    const redirect =
      html.match(/window\.location\.replace\("([^"]+)"\)/i)?.[1] ||
      html.match(/http-equiv="refresh" content="0;URL='([^']+)'"/i)?.[1] ||
      html.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i)?.[1] ||
      html.match(/location\.href\s*=\s*["']([^"']+)["']/i)?.[1] ||
      html.match(/<a[^>]+href="(https:\/\/[^"]+)"/i)?.[1];
    return redirect ?? raw;
  } catch {
    return raw;
  }
}

function cleanHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSearchBlockedPage(html: string, finalUrl = ""): boolean {
  return (
    /captcha|safe\.[^/]+\/page/i.test(finalUrl) ||
    /请输入验证码以便正常访问|访问异常页面|安全验证|验证码页面/i.test(html) ||
    (/<title>猎聘安全中心<\/title>/i.test(html) && html.length < 100_000)
  );
}

export function parseBingHtmlResults(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  for (const block of html.matchAll(/<li class="b_algo"[\s\S]*?<\/li>/gi)) {
    const titleMatch = block[0].match(
      /<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!titleMatch) continue;
    const url = titleMatch[1].replace(/&amp;/g, "&");
    if (!url.startsWith("https://")) continue;
    const snippetMatch =
      block[0].match(/<div[^>]*class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) ||
      block[0].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    results.push({
      title: cleanHtml(titleMatch[2]),
      url,
      snippet: snippetMatch ? cleanHtml(snippetMatch[1]) : ""
    });
    if (results.length >= 10) break;
  }
  return results;
}

export function parseSoHtmlResults(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  for (const match of html.matchAll(
    /<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/gi
  )) {
    const url = match[1].replace(/&amp;/g, "&");
    if (!url.includes("so.com/link")) continue;
    const trailing = html.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 1800);
    const snippet = trailing.match(/<p[^>]*class="[^"]*res-desc[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    results.push({
      title: cleanHtml(match[2]),
      url,
      snippet: snippet ? cleanHtml(snippet[1]) : ""
    });
    if (results.length >= 10) break;
  }
  return results;
}

export function parseLiepinListingResults(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  for (const match of html.matchAll(
    /<a[^>]*data-nick="job-detail-job-info"[^>]*href="(https:\/\/www\.liepin\.com\/job\/\d+\.shtml)"[^>]*>[\s\S]{0,2000}?<div[^>]*title="([^"]+)"[^>]*>/gi
  )) {
    const url = match[1].replace(/&amp;/g, "&");
    const title = cleanHtml(match[2]);
    if (!isJobDetailUrl(url) || !title) continue;
    const after = html.slice(
      (match.index ?? 0) + match[0].length,
      (match.index ?? 0) + match[0].length + 2500
    );
    const salary = after.match(/<span[^>]*class="[^"]*job-salary[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const location = after.match(/<div[^>]*class="[^"]*job-dq-box[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*ellipsis-1[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    results.push({
      title,
      url,
      snippet: [
        salary ? cleanHtml(salary[1]) : "",
        location ? cleanHtml(location[1]) : ""
      ].filter(Boolean).join(" · ")
    });
    if (results.length >= 10) break;
  }
  return [...new Map(results.map((result) => [result.url, result])).values()];
}

export function parseBaiduHtmlResults(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  for (const match of html.matchAll(
    /<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/gi
  )) {
    const url = match[1].replace(/&amp;/g, "&");
    if (!/^https?:\/\//i.test(url)) continue;
    const trailing = html.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 2200);
    const snippetMatch =
      trailing.match(/<div[^>]*class="[^"]*c-abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
      trailing.match(/<span[^>]*class="[^"]*content-right[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    results.push({
      title: cleanHtml(match[2]),
      url,
      snippet: snippetMatch ? cleanHtml(snippetMatch[1]) : ""
    });
    if (results.length >= 10) break;
  }
  return [...new Map(results.map((result) => [result.url, result])).values()];
}

function inferSalary(text: string): string | null {
  const match = text.match(
    /(?:薪资|月薪|工资)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?\s*[-~至]\s*[0-9]+(?:\.[0-9]+)?\s*[kK](?:\s*[·xX×*]\s*\d+薪)?|面议)/
  );
  if (match) return match[1].trim();
  const loose = text.match(
    /([0-9]+(?:\.[0-9]+)?\s*[-~至]\s*[0-9]+(?:\.[0-9]+)?\s*[kK](?:\s*[·xX×*]\s*\d+薪)?)/
  );
  return loose?.[1]?.trim() ?? null;
}

function inferLocation(text: string, preferences: DiscoveryPreferences): string | null {
  return preferences.locations.find((location) => text.includes(location)) ?? null;
}

const liepinCitySlugs: Record<string, string> = {
  成都: "cd",
  杭州: "hz",
  南京: "nj",
  长沙: "changsha",
  武汉: "wuhan",
  北京: "bj",
  上海: "sh",
  深圳: "sz"
};

const zhaopinCityCodes: Record<string, number> = {
  成都: 801,
  杭州: 531,
  南京: 635,
  长沙: 547,
  武汉: 736,
  北京: 530,
  上海: 538,
  深圳: 765
};

function listingUrlFor(preferences: DiscoveryPreferences): string | null {
  const title = preferences.targetTitles[0];
  const city = preferences.locations.find((value) => liepinCitySlugs[value]);
  if (!title || !city) return null;
  return `https://www.liepin.com/city-${liepinCitySlugs[city]}/zhaopin/?key=${encodeURIComponent(title)}`;
}

function zhaopinListingUrlFor(
  preferences: DiscoveryPreferences
): string | null {
  const title = preferences.targetTitles.slice(0, 2).join(" ");
  const city = preferences.locations.find((value) => zhaopinCityCodes[value]);
  if (!title || !city) return null;
  return `https://www.zhaopin.com/jobs/?jl=${zhaopinCityCodes[city]}&kw=${encodeURIComponent(title)}`;
}

export function parseZhaopinListingResults(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  for (const match of html.matchAll(
    /<a[^>]*href="(https:\/\/www\.zhaopin\.com\/jobdetail\/[A-Z0-9]+\.htm)"[^>]*title="([^"]+)"[^>]*class="[^"]*job-card__name/gi
  )) {
    const url = match[1].replace(/&amp;/g, "&");
    const title = cleanHtml(match[2]);
    if (!isJobDetailUrl(url) || !title) continue;
    results.push({ title, url, snippet: "" });
    if (results.length >= 10) break;
  }
  return [...new Map(results.map((result) => [result.url, result])).values()];
}

function matchesPreferredTitle(title: string, preferences: DiscoveryPreferences): boolean {
  const normalize = (value: string) =>
    value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
  const value = normalize(title);
  const terms = [...preferences.targetTitles, ...preferences.categoryNames];
  return terms.length === 0 || terms.some((term) => value.includes(normalize(term)));
}

async function collectListingResults(
  preferences: DiscoveryPreferences,
  fetchImpl: typeof fetch = fetch
): Promise<WebSearchResult[]> {
  const url = listingUrlFor(preferences);
  const zhaopinUrl = zhaopinListingUrlFor(preferences);
  if (!url && !zhaopinUrl) return [];
  try {
    const headers = {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      accept: "text/html"
    };
    const values = [zhaopinUrl, url].filter(
      (value): value is string => Boolean(value)
    );
    for (const value of values) {
      try {
        const response = await fetchImpl(value, { headers });
        if (!response.ok) continue;
        const html = await response.text();
        if (isSearchBlockedPage(html, response.url)) continue;
        const results = (value.includes("liepin.com")
          ? parseLiepinListingResults(html)
          : parseZhaopinListingResults(html))
          .filter((result) => matchesPreferredTitle(result.title, preferences))
          .slice(0, 20);
        if (results.length > 0) return results;
      } catch {
        // Try the next public listing source.
      }
    }
    return [];
  } catch {
    return [];
  }
}

async function defaultSearch(query: string): Promise<WebSearchResult[]> {
  const collected: WebSearchResult[] = [];
  try {
    const response = await fetch(
      "https://www.so.com/s?q=" + encodeURIComponent(query),
      {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          accept: "text/html"
        }
      }
    );
    if (response.ok) {
      const html = await response.text();
      if (!isSearchBlockedPage(html, response.url)) {
        collected.push(...parseSoHtmlResults(html));
      }
    }
  } catch {
    // Continue with the remaining public search sources.
  }
  try {
    const response = await fetch(
      `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=20&ie=utf-8`,
      {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          accept: "text/html"
        }
      }
    );
    if (response.ok) {
      const html = await response.text();
      if (!isSearchBlockedPage(html, response.url)) {
        collected.push(...parseBaiduHtmlResults(html));
      }
    }
  } catch {
    // Continue with Bing and the keyless fallback.
  }
  try {
    const response = await fetch(
      `https://cn.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-Hans`,
      {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          accept: "text/html"
        }
      }
    );
    if (response.ok) {
      const html = await response.text();
      if (!isSearchBlockedPage(html, response.url)) {
        collected.push(...parseBingHtmlResults(html));
      }
    }
  } catch {
    // Fall through to the existing keyless RSS search.
  }
  try {
    collected.push(...await searchPublicWeb({ query }));
  } catch {
    // Return the working sources rather than failing the entire daily run.
  }
  return [...new Map(collected.map((result) => [result.url, result])).values()]
    .slice(0, 20);
}

async function defaultFetchPage(url: string): Promise<{ html: string }> {
  const response = await fetchPublicPageResponse(fetch, url, 8000, 2);
  if (!response?.ok) throw new Error("岗位页面读取失败");
  if (isSearchBlockedPage("", response.url)) throw new Error("岗位源触发安全验证");
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new Error("岗位页面格式不受支持");
  }
  const html = (await response.text()).slice(0, 500_000);
  if (isSearchBlockedPage(html, response.url)) {
    throw new Error("岗位源触发安全验证");
  }
  return { html };
}

export async function collectDiscoveryPages(
  preferences: DiscoveryPreferences,
  deps: {
    search?: SearchFn;
    fetchPage?: FetchPageFn;
    fetch?: typeof fetch;
    now?: Date;
  } = {}
): Promise<DiscoveryPageSource[]> {
  const search = deps.search ?? defaultSearch;
  const fetchPage = deps.fetchPage ?? defaultFetchPage;
  const listingResults = deps.search
    ? []
    : await collectListingResults(preferences, deps.fetch ?? fetch);
  const searchResults = listingResults.length > 0
    ? []
    : (
        await Promise.all(buildDiscoveryQueries(preferences).map((query) => search(query)))
      ).flat();
  const results = [...listingResults.slice(0, 30), ...searchResults];
  const unique = new Map<string, WebSearchResult>();
  for (const result of results) {
    try {
      const canonical = normalizeDiscoveryUrl(result.url);
      if (!unique.has(canonical)) unique.set(canonical, result);
    } catch {
      continue;
    }
  }
  const ordered = [...unique.values()]
    .map((result) => ({
      ...result,
      resolvedUrl: result.url
    }))
    .sort((left, right) => {
      const isDetailOrRedirect = (url: string) =>
        isJobDetailUrl(url) || /(?:baidu|so)\.com\/link/i.test(url);
      const leftDetail = isDetailOrRedirect(left.url);
      const rightDetail = isDetailOrRedirect(right.url);
      return leftDetail === rightDetail ? 0 : leftDetail ? -1 : 1;
    });
  const pages: DiscoveryPageSource[] = [];
  const seenCanonicalUrls = new Set<string>();
  for (const result of ordered) {
    if (pages.length >= 6) break;
    let resolved = result.url;
    try {
      resolved = /baidu\.com\/link/i.test(result.url)
        ? await resolveBaiduRedirectUrl(result.url)
        : /so\.com\/link/i.test(result.url)
          ? await resolveSoRedirectUrl(result.url)
          : result.url;
      if (!isJobDetailUrl(resolved)) continue;
      const canonicalUrl = normalizeDiscoveryUrl(resolved);
      if (seenCanonicalUrls.has(canonicalUrl)) continue;
      const { html } = await fetchPage(canonicalUrl);
      seenCanonicalUrls.add(canonicalUrl);
      const structured = parseJobPostingJsonLd(html, canonicalUrl);
      const readable = trimToCharacterBudget(extractReadableText(html), 6000);
      const text = `${result.snippet} ${structured?.description ?? ""} ${readable}`.trim();
      pages.push({
        sourceUrl: resolved,
        canonicalUrl,
        sourceDomain: new URL(canonicalUrl).hostname,
        sourceTitle: result.title,
        snippet: result.snippet,
        title:
          structured?.title ||
          result.title.replace(/\s*[-|｜].*$/, "").trim() ||
          result.title,
        company: structured?.company ?? null,
        location:
          structured?.location ??
          inferLocation(text, preferences),
        salary: structured?.salary ?? inferSalary(text),
        description:
          structured?.description ||
          trimToCharacterBudget(readable || result.snippet, 6000),
        postedAt: structured?.postedAt ?? null,
        validThrough: structured?.validThrough ?? null
      });
    } catch {
      if (!isJobDetailUrl(resolved)) continue;
      const canonicalUrl = normalizeDiscoveryUrl(resolved);
      if (seenCanonicalUrls.has(canonicalUrl)) continue;
      seenCanonicalUrls.add(canonicalUrl);
      pages.push({
        sourceUrl: resolved,
        canonicalUrl,
        sourceDomain: new URL(resolved).hostname,
        sourceTitle: result.title,
        snippet: result.snippet,
        title: result.title.replace(/\s*[-|｜].*$/, "").trim() || result.title,
        company: null,
        location: inferLocation(result.snippet, preferences),
        salary: inferSalary(result.snippet),
        description: trimToCharacterBudget(result.snippet, 6000),
        postedAt: null,
        validThrough: null
      });
    }
  }
  return pages;
}

import { trimToCharacterBudget } from "../shared/assistant";

type FetchImpl = typeof fetch;

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type WebPage = WebSearchResult & {
  content: string;
  domain: string;
};

const privateHostPatterns = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^\[::1\]$/i,
  /^::$/,
  /^\[?fc[0-9a-f]{2}:/i,
  /^\[?fd[0-9a-f]{2}:/i,
  /^\[?fe80:/i
];

export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (!["http:", "https:"].includes(url.protocol)) return false;
  const hostname = url.hostname.toLowerCase();
  if (privateHostPatterns.some((pattern) => pattern.test(hostname))) {
    return false;
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
  return hostname.includes(".") || hostname.includes(":");
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .trim();
}

function stripTags(value: string): string {
  return value
    .replace(/<(script|style|noscript|template|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagValue(item: string, tag: string): string {
  const match = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? stripTags(decodeEntities(match[1])) : "";
}

export function parseBingRss(xml: string): WebSearchResult[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  return items
    .map((match) => ({
      title: tagValue(match[1], "title"),
      url: tagValue(match[1], "link"),
      snippet: tagValue(match[1], "description")
    }))
    .filter(
      (result) =>
        result.title &&
        result.url.startsWith("https://") &&
        isPublicHttpUrl(result.url)
    );
}

export function extractReadableText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|template|svg|nav|footer|form)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|p|div|li|h[1-6]|section|article|tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

async function fetchWithTimeout(
  fetchImpl: FetchImpl,
  input: string,
  timeoutMs: number
): Promise<Response> {
  return fetchImpl(input, {
    redirect: "manual",
    signal: timeoutSignal(timeoutMs),
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; JobBoardAssistant/1.0)",
      accept: "text/html,application/xhtml+xml,application/rss+xml"
    }
  });
}

async function validateRedirect(
  fetchImpl: FetchImpl,
  initialUrl: string,
  timeoutMs: number,
  maxRedirects = 4
): Promise<Response | null> {
  let current = initialUrl;
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    if (!isPublicHttpUrl(current)) return null;
    const response = await fetchWithTimeout(fetchImpl, current, timeoutMs);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      current = new URL(location, current).toString();
      continue;
    }
    return response;
  }
  return null;
}

export async function fetchPublicPageResponse(
  fetchImpl: FetchImpl,
  url: string,
  timeoutMs = 8000,
  maxRedirects = 4
): Promise<Response | null> {
  return validateRedirect(fetchImpl, url, timeoutMs, maxRedirects);
}

export async function searchPublicWeb(input: {
  query: string;
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}): Promise<WebSearchResult[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 8000;
  const query = encodeURIComponent(input.query.slice(0, 500));
  try {
    const bing = await fetchWithTimeout(
      fetchImpl,
      `https://www.bing.com/search?format=rss&q=${query}`,
      timeoutMs
    );
    if (bing.ok) {
      const results = parseBingRss(await bing.text());
      if (results.length > 0) return results.slice(0, 8);
    }
  } catch {
    // Fall through to the secondary keyless endpoint.
  }

  try {
    const fallback = await fetchWithTimeout(
      fetchImpl,
      `https://lite.duckduckgo.com/lite/?q=${query}`,
      timeoutMs
    );
    if (!fallback.ok) return [];
    const html = await fallback.text();
    const results: WebSearchResult[] = [];
    for (const match of html.matchAll(
      /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi
    )) {
      const url = decodeEntities(match[1]);
      if (!url.startsWith("https://") || !isPublicHttpUrl(url)) continue;
      results.push({
        title: stripTags(decodeEntities(match[2])),
        url,
        snippet: stripTags(decodeEntities(match[3]))
      });
    }
    return results.slice(0, 8);
  } catch {
    return [];
  }
}

function sourcePriority(url: string): number {
  const host = new URL(url).hostname;
  if (/\.(gov\.cn|edu\.cn)$|\.gov$|\.edu$/i.test(host)) return 0;
  if (/zhipin\.com|liepin\.com|zhaopin\.com|linkedin\.com|boss\.com/i.test(host)) {
    return 1;
  }
  if (/apple\.com|microsoft\.com|google\.com|mozilla\.org|wikipedia\.org/i.test(host)) {
    return 1;
  }
  return 2;
}

export async function readPublicWebPages(input: {
  query: string;
  limit?: number;
  maxCharactersPerPage?: number;
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}): Promise<WebPage[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 8000;
  const limit = Math.min(input.limit ?? 3, 3);
  const maxCharactersPerPage = Math.min(input.maxCharactersPerPage ?? 8000, 8000);
  const results = await searchPublicWeb({
    query: input.query,
    fetchImpl,
    timeoutMs
  });
  const ordered = [...results].sort((left, right) => sourcePriority(left.url) - sourcePriority(right.url));
  const pages: WebPage[] = [];
  const seenDomains = new Set<string>();
  for (const result of ordered) {
    if (pages.length >= limit) break;
    const domain = new URL(result.url).hostname;
    if (seenDomains.has(domain) && ordered.length > limit * 2) continue;
    try {
      const response = await validateRedirect(fetchImpl, result.url, timeoutMs);
      if (!response?.ok) continue;
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) continue;
      const html = (await response.text()).slice(0, 500_000);
      const content = trimToCharacterBudget(
        extractReadableText(html) || result.snippet,
        maxCharactersPerPage
      );
      if (!content) continue;
      seenDomains.add(domain);
      pages.push({ ...result, content, domain });
    } catch {
      continue;
    }
  }
  return pages;
}

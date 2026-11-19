import { z } from "zod";

const stringList = z.array(z.string().trim().min(1).max(80)).max(20);

export const discoveryPreferencesSchema = z.object({
  targetTitles: stringList.default([]),
  categoryIds: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  categoryNames: stringList.default([]),
  locations: stringList.default([]),
  remoteAllowed: z.boolean().default(false),
  salaryFloorK: z.number().int().min(0).max(1000).nullable().default(null),
  experienceLevel: z.string().trim().max(40).default(""),
  includeKeywords: stringList.default([]),
  excludeKeywords: stringList.default([]),
  enabled: z.boolean().default(false)
});

export type DiscoveryPreferences = z.infer<typeof discoveryPreferencesSchema>;

const discoveryModelRecommendationSchema = z.object({
  candidateId: z.string().trim().min(1),
  isJob: z.boolean(),
  title: z.string().trim().min(1).max(160),
  company: z.string().trim().min(1).max(160).nullable(),
  location: z.string().trim().min(1).max(160).nullable(),
  salary: z.string().trim().min(1).max(120).nullable(),
  remote: z.boolean().default(false),
  categoryName: z.string().trim().min(1).max(30).nullable(),
  responsibilities: stringList.default([]),
  requirements: stringList.default([]),
  abilities: z.object({
    hard: stringList.default([]),
    general: stringList.default([]),
    experience: stringList.default([])
  }),
  match: z.object({
    level: z.enum(["high", "medium", "low"]),
    score: z.number().int().min(0).max(100),
    strengths: stringList.default([]),
    gaps: stringList.default([]),
    evidence: stringList.default([])
  }),
  missingFields: stringList.default([])
});

export type DiscoveryModelRecommendation = z.infer<
  typeof discoveryModelRecommendationSchema
>;

const discoveryModelResponseSchema = z.object({
  recommendations: z.array(discoveryModelRecommendationSchema).max(10)
});

export type DiscoveryModelResponse = z.infer<
  typeof discoveryModelResponseSchema
>;

export type DiscoveryRun = {
  id: string;
  triggerType: "scheduled" | "manual";
  status: "queued" | "running" | "completed" | "failed";
  candidateCount: number;
  hardFilteredCount: number;
  modelExcludedCount: number;
  recommendationCount: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type JobRecommendation = {
  id: string;
  runId: string | null;
  sourceUrl: string;
  canonicalUrl: string;
  sourceDomain: string;
  sourceTitle: string;
  snippet: string;
  fingerprint: string;
  title: string;
  company: string | null;
  location: string | null;
  salary: string | null;
  salaryMinK: number | null;
  salaryMaxK: number | null;
  salaryKnown: boolean;
  categoryName: string | null;
  responsibilities: string[];
  requirements: string[];
  abilities: { hard: string[]; general: string[]; experience: string[] };
  match: {
    level: "high" | "medium" | "low";
    score: number;
    strengths: string[];
    gaps: string[];
    evidence: string[];
  };
  missingFields: string[];
  sourcePostedAt: string | null;
  sourceValidThrough: string | null;
  state: "new" | "saved" | "ignored";
  savedOpportunityId: string | null;
  discoveredAt: string;
  expiresAt: string;
};

export type RecommendationDraft = Omit<
  JobRecommendation,
  | "id"
  | "runId"
  | "state"
  | "savedOpportunityId"
  | "discoveredAt"
  | "expiresAt"
>;

export type DiscoveryOverview = {
  preferences: DiscoveryPreferences;
  lastRun: DiscoveryRun | null;
  recommendations: JobRecommendation[];
  manualRunsToday: number;
  manualRunLimit: number;
  canRunNow: boolean;
};

export function parseDiscoveryModelResponse(raw: string): DiscoveryModelResponse {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error("岗位发现模型未返回有效 JSON");
  }
  const result = discoveryModelResponseSchema.safeParse(parsed);
  if (!result.success) throw new Error("岗位发现模型返回格式不完整");
  return result.data;
}

export function validateDiscoveryPreferences(
  input: unknown
): DiscoveryPreferences {
  const parsed = discoveryPreferencesSchema.safeParse(input);
  if (!parsed.success) throw new Error("求职偏好格式不正确");
  const preferences = {
    ...parsed.data,
    targetTitles: [...new Set(parsed.data.targetTitles)],
    categoryIds: [...new Set(parsed.data.categoryIds)],
    categoryNames: [...new Set(parsed.data.categoryNames)],
    locations: [...new Set(parsed.data.locations)],
    includeKeywords: [...new Set(parsed.data.includeKeywords)],
    excludeKeywords: [...new Set(parsed.data.excludeKeywords)]
  };
  if (
    preferences.targetTitles.length === 0 &&
    preferences.categoryIds.length === 0
  ) {
    throw new Error("至少填写一个目标岗位或选择分类");
  }
  if (preferences.locations.length === 0 && !preferences.remoteAllowed) {
    throw new Error("至少填写一个城市或允许远程");
  }
  return preferences;
}

export function buildDiscoveryQueries(
  preferences: DiscoveryPreferences
): string[] {
  const titles = preferences.targetTitles.length
    ? preferences.targetTitles
    : preferences.categoryNames;
  const primaryTitle = titles[0] ?? "岗位";
  const location = preferences.locations[0] ?? "全国";
  const keyword = preferences.includeKeywords[0] ?? "";
  const queries = [
    [primaryTitle, location, keyword, "招聘", "职位"],
    [primaryTitle, location, keyword, "BOSS直聘"],
    [primaryTitle, location, keyword, "猎聘"],
    [primaryTitle, location, keyword, "智联招聘"]
  ].map((parts) => parts.filter(Boolean).join(" "));
  if (preferences.remoteAllowed) {
    queries.push(
      [primaryTitle, "远程", keyword, "BOSS直聘", "job_detail"]
        .filter(Boolean).join(" ")
    );
  }
  return [...new Set(queries)].slice(0, 4);
}

const trackingParameters = new Set([
  "gclid",
  "fbclid",
  "spm",
  "ref",
  "source",
  "from",
  "campaign"
]);

export function normalizeDiscoveryUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || trackingParameters.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  const sorted = [...url.searchParams.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );
  url.search = "";
  for (const [key, value] of sorted) url.searchParams.append(key, value);
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export type ParsedMonthlySalary = {
  raw: string;
  minK: number | null;
  maxK: number | null;
  known: boolean;
};

export function parseMonthlySalaryK(raw: string | null): ParsedMonthlySalary {
  const value = raw?.trim() ?? "";
  if (!value) return { raw: value, minK: null, maxK: null, known: false };
  if (/年薪|面议|薪资面谈|negotiable/i.test(value)) {
    return { raw: value, minK: null, maxK: null, known: false };
  }
  const kRange = value.match(
    /(\d+(?:\.\d+)?)\s*[-~至]\s*(\d+(?:\.\d+)?)\s*[kK]/
  );
  if (kRange) {
    return {
      raw: value,
      minK: Number(kRange[1]),
      maxK: Number(kRange[2]),
      known: true
    };
  }
  const yuanRange = value.match(
    /(\d{4,6})\s*[-~至]\s*(\d{4,6})\s*(?:元|人民币)?/
  );
  if (yuanRange) {
    return {
      raw: value,
      minK: Number(yuanRange[1]) / 1000,
      maxK: Number(yuanRange[2]) / 1000,
      known: true
    };
  }
  const singleK = value.match(/(\d+(?:\.\d+)?)\s*[kK]/);
  if (singleK) {
    const amount = Number(singleK[1]);
    return { raw: value, minK: amount, maxK: amount, known: true };
  }
  return { raw: value, minK: null, maxK: null, known: false };
}

export function matchesDiscoveryHardFilters(
  candidate: { title: string; location: string; text: string },
  preferences: DiscoveryPreferences
): boolean {
  const haystack = `${candidate.title} ${candidate.location} ${candidate.text}`
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN");
  const compactHaystack = haystack.replace(/[^\p{Letter}\p{Number}]+/gu, "");
  const compact = (value: string) =>
    value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[^\p{Letter}\p{Number}]+/gu, "");
  if (
    preferences.excludeKeywords.some((keyword) =>
      compactHaystack.includes(compact(keyword))
    )
  ) {
    return false;
  }
  const targetTerms = [
    ...preferences.targetTitles,
    ...preferences.categoryNames
  ];
  const targetMatch =
    targetTerms.length === 0 ||
    targetTerms.some((term) =>
      compactHaystack.includes(compact(term))
    );
  if (!targetMatch) return false;

  const normalizedLocation = candidate.location.normalize("NFKC");
  const locationMatch =
    preferences.locations
      .filter((location) => location !== "远程")
      .some((location) =>
      `${normalizedLocation} ${candidate.text}`.includes(location)
      ) || false;
  const remoteText =
    /远程办公|可远程|支持远程|remote/i.test(haystack) &&
    !/不能远程|不支持远程|不可远程/i.test(haystack);
  return locationMatch || (preferences.remoteAllowed && remoteText);
}

function fingerprintPart(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "")
    .trim();
}

export function buildRecommendationFingerprint(input: {
  company: string | null;
  title: string;
  location: string | null;
}): string {
  return [
    fingerprintPart(input.company ?? ""),
    fingerprintPart(input.title),
    fingerprintPart(input.location ?? "")
  ].join("|");
}

import {
  validateDiscoveryPreferences,
  type DiscoveryPreferences,
  type DiscoveryRun,
  type JobRecommendation,
  type RecommendationDraft
} from "../shared/discovery";

type DiscoveryDB = Pick<D1Database, "prepare" | "batch">;

type PreferencesRow = {
  target_titles: string;
  category_ids: string;
  locations: string;
  remote_allowed: number;
  salary_floor_k: number | null;
  experience_level: string;
  include_keywords: string;
  exclude_keywords: string;
  enabled: number;
};

type RunRow = {
  id: string;
  trigger_type: "scheduled" | "manual";
  status: "queued" | "running" | "completed" | "failed";
  candidate_count: number;
  hard_filtered_count: number;
  model_excluded_count: number;
  recommendation_count: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type RecommendationRow = {
  id: string;
  run_id: string | null;
  source_url: string;
  canonical_url: string;
  source_domain: string;
  source_title: string;
  snippet: string;
  fingerprint: string;
  title: string;
  company: string | null;
  location: string | null;
  salary: string | null;
  salary_min_k: number | null;
  salary_max_k: number | null;
  salary_known: number;
  category_name: string | null;
  responsibilities: string;
  requirements: string;
  hard_abilities: string;
  general_abilities: string;
  experience_requirements: string;
  match_level: "high" | "medium" | "low";
  match_score: number;
  match_strengths: string;
  match_gaps: string;
  match_evidence: string;
  missing_fields: string;
  source_posted_at: string | null;
  source_valid_through: string | null;
  state: "new" | "saved" | "ignored";
  saved_opportunity_id: string | null;
  discovered_at: string;
  expires_at: string;
};

function parseArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function mapRun(row: RunRow): DiscoveryRun {
  return {
    id: row.id,
    triggerType: row.trigger_type,
    status: row.status,
    candidateCount: row.candidate_count,
    hardFilteredCount: row.hard_filtered_count,
    modelExcludedCount: row.model_excluded_count,
    recommendationCount: row.recommendation_count,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at
  };
}

export function mapRecommendation(row: RecommendationRow): JobRecommendation {
  return {
    id: row.id,
    runId: row.run_id,
    sourceUrl: row.source_url,
    canonicalUrl: row.canonical_url,
    sourceDomain: row.source_domain,
    sourceTitle: row.source_title,
    snippet: row.snippet,
    fingerprint: row.fingerprint,
    title: row.title,
    company: row.company,
    location: row.location,
    salary: row.salary,
    salaryMinK: row.salary_min_k,
    salaryMaxK: row.salary_max_k,
    salaryKnown: row.salary_known === 1,
    categoryName: row.category_name,
    responsibilities: parseArray(row.responsibilities),
    requirements: parseArray(row.requirements),
    abilities: {
      hard: parseArray(row.hard_abilities),
      general: parseArray(row.general_abilities),
      experience: parseArray(row.experience_requirements)
    },
    match: {
      level: row.match_level,
      score: row.match_score,
      strengths: parseArray(row.match_strengths),
      gaps: parseArray(row.match_gaps),
      evidence: parseArray(row.match_evidence)
    },
    missingFields: parseArray(row.missing_fields),
    sourcePostedAt: row.source_posted_at,
    sourceValidThrough: row.source_valid_through,
    state: row.state,
    savedOpportunityId: row.saved_opportunity_id,
    discoveredAt: row.discovered_at,
    expiresAt: row.expires_at
  };
}

async function categoryNamesFor(
  DB: DiscoveryDB,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await DB.prepare(
    `SELECT name FROM categories WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY sort_order`
  ).bind(...ids).all<{ name: string }>();
  return rows.results.map((row) => row.name);
}

export async function getDiscoveryPreferences(
  DB: DiscoveryDB
): Promise<DiscoveryPreferences> {
  const row = await DB.prepare(
    "SELECT * FROM job_discovery_preferences WHERE id = 1"
  ).first<PreferencesRow>();
  if (!row) {
    return {
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
  }
  const categoryIds = parseArray(row.category_ids);
  return {
    targetTitles: parseArray(row.target_titles),
    categoryIds,
    categoryNames: await categoryNamesFor(DB, categoryIds),
    locations: parseArray(row.locations),
    remoteAllowed: row.remote_allowed === 1,
    salaryFloorK: row.salary_floor_k,
    experienceLevel: row.experience_level,
    includeKeywords: parseArray(row.include_keywords),
    excludeKeywords: parseArray(row.exclude_keywords),
    enabled: row.enabled === 1
  };
}

export async function saveDiscoveryPreferences(
  DB: DiscoveryDB,
  input: unknown,
  now = new Date()
): Promise<DiscoveryPreferences> {
  const preferences = validateDiscoveryPreferences(input);
  const timestamp = now.toISOString();
  await DB.prepare(
    `INSERT INTO job_discovery_preferences (
      id, target_titles, category_ids, locations, remote_allowed,
      salary_floor_k, experience_level, include_keywords, exclude_keywords,
      enabled, created_at, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      target_titles = excluded.target_titles,
      category_ids = excluded.category_ids,
      locations = excluded.locations,
      remote_allowed = excluded.remote_allowed,
      salary_floor_k = excluded.salary_floor_k,
      experience_level = excluded.experience_level,
      include_keywords = excluded.include_keywords,
      exclude_keywords = excluded.exclude_keywords,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at`
  ).bind(
    JSON.stringify(preferences.targetTitles),
    JSON.stringify(preferences.categoryIds),
    JSON.stringify(preferences.locations),
    preferences.remoteAllowed ? 1 : 0,
    preferences.salaryFloorK,
    preferences.experienceLevel,
    JSON.stringify(preferences.includeKeywords),
    JSON.stringify(preferences.excludeKeywords),
    preferences.enabled ? 1 : 0,
    timestamp,
    timestamp
  ).run();
  return {
    ...preferences,
    categoryNames: await categoryNamesFor(DB, preferences.categoryIds)
  };
}

export function chinaDayStart(now = new Date()): Date {
  const china = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return new Date(`${china.toISOString().slice(0, 10)}T00:00:00+08:00`);
}

export async function createDiscoveryRun(
  DB: DiscoveryDB,
  triggerType: "scheduled" | "manual",
  now = new Date(),
  id = crypto.randomUUID()
): Promise<DiscoveryRun> {
  const timestamp = now.toISOString();
  await DB.prepare(
    "INSERT INTO job_discovery_runs (id, trigger_type, status, created_at) VALUES (?, ?, 'queued', ?)"
  ).bind(id, triggerType, timestamp).run();
  return {
    id,
    triggerType,
    status: "queued",
    candidateCount: 0,
    hardFilteredCount: 0,
    modelExcludedCount: 0,
    recommendationCount: 0,
    error: null,
    createdAt: timestamp,
    startedAt: null,
    completedAt: null
  };
}

export async function getDiscoveryRun(
  DB: DiscoveryDB,
  id: string
): Promise<DiscoveryRun | null> {
  const row = await DB.prepare(
    "SELECT * FROM job_discovery_runs WHERE id = ?"
  ).bind(id).first<RunRow>();
  return row ? mapRun(row) : null;
}

export async function canStartManualDiscovery(
  DB: DiscoveryDB,
  now = new Date()
): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  reason?: string;
  nextAllowedAt?: string;
}> {
  const preferences = await getDiscoveryPreferences(DB);
  try {
    validateDiscoveryPreferences(preferences);
  } catch (error) {
    return {
      allowed: false,
      used: 0,
      limit: 3,
      reason: error instanceof Error ? error.message : "请先完善求职偏好"
    };
  }
  const rows = await DB.prepare(
    "SELECT created_at AS createdAt FROM job_discovery_runs WHERE trigger_type = 'manual' AND created_at >= ? ORDER BY created_at DESC"
  ).bind(chinaDayStart(now).toISOString()).all<{ createdAt: string }>();
  const used = rows.results.length;
  if (used >= 3) {
    return { allowed: false, used, limit: 3, reason: "今日手动刷新次数已用完" };
  }
  const latest = rows.results[0]?.createdAt;
  if (latest) {
    const next = new Date(new Date(latest).getTime() + 30 * 60_000);
    if (next > now) {
      return {
        allowed: false,
        used,
        limit: 3,
        reason: "两次手动刷新至少间隔 30 分钟",
        nextAllowedAt: next.toISOString()
      };
    }
  }
  return { allowed: true, used, limit: 3 };
}

export async function updateDiscoveryRun(
  DB: DiscoveryDB,
  id: string,
  input: {
    status: DiscoveryRun["status"];
    candidateCount?: number;
    hardFilteredCount?: number;
    modelExcludedCount?: number;
    recommendationCount?: number;
    error?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
  }
): Promise<void> {
  const current = await DB.prepare(
    "SELECT * FROM job_discovery_runs WHERE id = ?"
  ).bind(id).first<RunRow>();
  if (!current) throw new Error("发现任务不存在");
  await DB.prepare(
    "UPDATE job_discovery_runs SET status = ?, candidate_count = ?, hard_filtered_count = ?, model_excluded_count = ?, recommendation_count = ?, error = ?, started_at = ?, completed_at = ? WHERE id = ?"
  ).bind(
    input.status,
    input.candidateCount ?? current.candidate_count,
    input.hardFilteredCount ?? current.hard_filtered_count,
    input.modelExcludedCount ?? current.model_excluded_count,
    input.recommendationCount ?? current.recommendation_count,
    input.error === undefined ? current.error : input.error,
    input.startedAt === undefined ? current.started_at : input.startedAt,
    input.completedAt === undefined ? current.completed_at : input.completedAt,
    id
  ).run();
}

export async function addRecommendations(
  DB: DiscoveryDB,
  runId: string,
  recommendations: RecommendationDraft[],
  now = new Date()
): Promise<number> {
  let inserted = 0;
  const timestamp = now.toISOString();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60_000).toISOString();
  const seenCanonical = new Set<string>();
  const seenFingerprint = new Set<string>();
  for (const item of recommendations) {
    if (
      seenCanonical.has(item.canonicalUrl) ||
      seenFingerprint.has(item.fingerprint)
    ) continue;
    seenCanonical.add(item.canonicalUrl);
    seenFingerprint.add(item.fingerprint);
    const existing = await DB.prepare(
      "SELECT id FROM job_recommendations WHERE canonical_url = ? OR fingerprint = ? LIMIT 1"
    ).bind(item.canonicalUrl, item.fingerprint).first();
    const existingOpportunity = await DB.prepare(
      "SELECT id FROM opportunities WHERE source_url = ? OR (LOWER(COALESCE(company, '')) = LOWER(?) AND LOWER(title) = LOWER(?) AND LOWER(COALESCE(location, '')) = LOWER(?)) LIMIT 1"
    ).bind(
      item.canonicalUrl,
      item.company ?? "",
      item.title,
      item.location ?? ""
    ).first();
    if (existing || existingOpportunity) continue;
    await DB.prepare(
      `INSERT INTO job_recommendations (
        id, run_id, source_url, canonical_url, source_domain, source_title,
        snippet, fingerprint, title, company, location, salary, salary_min_k,
        salary_max_k, salary_known, category_name, responsibilities,
        requirements, hard_abilities, general_abilities,
        experience_requirements, match_level, match_score, match_strengths,
        match_gaps, match_evidence, missing_fields, source_posted_at,
        source_valid_through, state, discovered_at, expires_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), runId, item.sourceUrl, item.canonicalUrl,
      item.sourceDomain, item.sourceTitle, item.snippet, item.fingerprint,
      item.title, item.company, item.location, item.salary, item.salaryMinK,
      item.salaryMaxK, item.salaryKnown ? 1 : 0, item.categoryName,
      JSON.stringify(item.responsibilities), JSON.stringify(item.requirements),
      JSON.stringify(item.abilities.hard), JSON.stringify(item.abilities.general),
      JSON.stringify(item.abilities.experience), item.match.level,
      item.match.score, JSON.stringify(item.match.strengths),
      JSON.stringify(item.match.gaps), JSON.stringify(item.match.evidence),
      JSON.stringify(item.missingFields), item.sourcePostedAt,
      item.sourceValidThrough, timestamp, expiresAt, timestamp
    ).run();
    inserted += 1;
  }
  return inserted;
}

export async function listRecommendations(
  DB: DiscoveryDB,
  now = new Date()
): Promise<JobRecommendation[]> {
  const rows = await DB.prepare(
    "SELECT * FROM job_recommendations WHERE expires_at > ? AND state != 'ignored' ORDER BY match_score DESC, discovered_at DESC"
  ).bind(now.toISOString()).all<RecommendationRow>();
  return rows.results.map(mapRecommendation);
}

export async function getRecommendation(
  DB: DiscoveryDB,
  id: string
): Promise<JobRecommendation | null> {
  const row = await DB.prepare(
    "SELECT * FROM job_recommendations WHERE id = ?"
  ).bind(id).first<RecommendationRow>();
  return row ? mapRecommendation(row) : null;
}

export async function updateRecommendationState(
  DB: DiscoveryDB,
  id: string,
  state: "saved" | "ignored",
  now = new Date(),
  savedOpportunityId?: string
): Promise<void> {
  await DB.prepare(
    "UPDATE job_recommendations SET state = ?, saved_opportunity_id = COALESCE(?, saved_opportunity_id), updated_at = ? WHERE id = ?"
  ).bind(state, savedOpportunityId ?? null, now.toISOString(), id).run();
}

export async function pruneDiscoveryRecommendations(
  DB: DiscoveryDB,
  now = new Date()
): Promise<void> {
  await DB.prepare("DELETE FROM job_recommendations WHERE expires_at <= ?")
    .bind(now.toISOString()).run();
  const count = await DB.prepare(
    "SELECT COUNT(*) AS count FROM job_recommendations"
  ).first<{ count: number }>();
  const overflow = Math.max(0, (count?.count ?? 0) - 200);
  if (overflow === 0) return;
  await DB.prepare(
    `DELETE FROM job_recommendations WHERE id IN (
      SELECT id FROM job_recommendations
      ORDER BY CASE state WHEN 'ignored' THEN 0 WHEN 'new' THEN 1 ELSE 2 END,
        match_score ASC, discovered_at ASC
      LIMIT ?
    )`
  ).bind(overflow).run();
}

export async function getDiscoveryOverview(
  DB: DiscoveryDB,
  now = new Date()
): Promise<{
  preferences: DiscoveryPreferences;
  lastRun: DiscoveryRun | null;
  recommendations: JobRecommendation[];
  manualRunsToday: number;
  manualRunLimit: number;
  canRunNow: boolean;
}> {
  const preferences = await getDiscoveryPreferences(DB);
  const runRow = await DB.prepare(
    "SELECT * FROM job_discovery_runs ORDER BY created_at DESC LIMIT 1"
  ).first<RunRow>();
  const manual = await canStartManualDiscovery(DB, now);
  return {
    preferences,
    lastRun: runRow ? mapRun(runRow) : null,
    recommendations: await listRecommendations(DB, now),
    manualRunsToday: manual.used,
    manualRunLimit: manual.limit,
    canRunNow: manual.allowed
  };
}

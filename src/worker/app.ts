import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";

import {
  hashAccessCode,
  signSession,
  verifyAccessCode,
  verifySession,
  type StoredAccessCode
} from "./auth";
import type { JobBoardEnv } from "./env";
import { mapExtractionJob, type ExtractionImageRow, type ExtractionJobRow } from "./extraction";
import { encryptSecret } from "./crypto";
import { validateAIEndpoint } from "./ai";
import { reserveAIRequest, toUsageDay } from "./usage";
import assistantRoutes from "./assistantRoutes";
import discoveryRoutes from "./discoveryRoutes";
import { indexOpportunity } from "./assistantRepository";
import {
  checkLoginBlock,
  clearLoginFailures,
  recordFailedLogin
} from "./loginLimit";
import {
  createOpportunitySchema,
  mapInterviewRound,
  mapOpportunity,
  opportunityInsertValues,
  type InterviewRoundRow,
  type OpportunityImageRow,
  type OpportunityRow,
  type StatusHistoryRow
} from "./opportunity";

const SESSION_COOKIE = "job_board_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function sessionCookieOptions(url: string, maxAge: number) {
  return {
    httpOnly: true,
    secure: new URL(url).protocol === "https:",
    sameSite: "Lax" as const,
    path: "/",
    maxAge
  };
}

const setupSchema = z.object({
  accessCode: z.string().trim().min(12).max(128)
});

const loginSchema = z.object({
  accessCode: z.string().trim().min(1).max(128)
});

const categoryNameSchema = z.string().trim().min(1).max(20);
const createCategorySchema = z.object({
  name: categoryNameSchema
});
const updateCategorySchema = z.object({
  name: categoryNameSchema
});

const createInterviewRoundSchema = z.object({
  roundType: z.string().trim().min(1).max(20),
  scheduledAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)
    .nullable()
    .default(null),
  result: z.string().trim().min(1).max(20).nullable().default(null),
  notes: z.string().max(2000).nullable().default(null)
});

const profileSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  skills: z.array(z.string().trim().min(1)).default([]),
  experiences: z.array(z.string().trim().min(1)).default([]),
  strengths: z.array(z.string().trim().min(1)).default([]),
  gaps: z.array(z.string().trim().min(1)).default([])
});

const aiSettingsSchema = z.object({
  baseUrl: z.string().trim().min(1),
  model: z.string().trim().min(1).max(100),
  apiKey: z.string().trim().max(500),
  dailyLimit: z.number().int().min(1).max(100).default(30),
  assistantDailyLimit: z.number().int().min(1).max(100).default(50)
});

const updateOpportunitySchema = createOpportunitySchema.extend({
  version: z.number().int().positive()
});

async function issueSession(c: {
  env: JobBoardEnv;
}): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  return signSession({ sub: "owner", exp }, c.env.SESSION_SECRET);
}

const app = new Hono<{ Bindings: JobBoardEnv }>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.use("/api/*", async (c, next) => {
  if (
    c.req.method === "GET" &&
    c.req.path === "/api/health"
  ) {
    return next();
  }

  if (
    c.req.path === "/api/auth/setup" ||
    c.req.path === "/api/auth/login"
  ) {
    return next();
  }

  const token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    return c.json({ error: "请先登录" }, 401);
  }

  const payload = await verifySession(token, c.env.SESSION_SECRET);
  if (!payload) {
    return c.json({ error: "登录已失效，请重新登录" }, 401);
  }

  return next();
});

app.post("/api/auth/setup", async (c) => {
  const existing = await c.env.DB.prepare(
    "SELECT id FROM access_code WHERE id = 1"
  ).first();
  if (existing) {
    return c.json({ error: "访问码已设置，请直接登录" }, 409);
  }

  const parsed = setupSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: "访问码长度需在 12 到 128 个字符之间" },
      422
    );
  }

  const stored = await hashAccessCode(parsed.data.accessCode);
  await c.env.DB.prepare(
    "INSERT INTO access_code (id, salt, hash, iterations, updated_at) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(1, stored.salt, stored.hash, stored.iterations, new Date().toISOString())
    .run();

  setCookie(
    c,
    SESSION_COOKIE,
    await issueSession(c),
    sessionCookieOptions(c.req.url, SESSION_TTL_SECONDS)
  );

  return c.json({ ok: true }, 201);
});

app.post("/api/auth/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "请输入访问码" }, 422);
  }

  const sourceKey =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "local";
  try {
    const block = await checkLoginBlock(c.env.DB, sourceKey);
    if (block) {
      return c.json(
        {
          error: `尝试次数过多，请在 ${Math.ceil(block.retryAfterSeconds / 60)} 分钟后重试`
        },
        429
      );
    }
  } catch (error) {
    console.error("登录限流检查失败，已降级为普通登录", error);
  }

  const stored = await c.env.DB.prepare(
    "SELECT salt, hash, iterations FROM access_code WHERE id = 1"
  ).first<StoredAccessCode>();
  if (!stored) {
    return c.json({ error: "尚未设置访问码" }, 404);
  }

  let valid: boolean;
  try {
    valid = await verifyAccessCode(parsed.data.accessCode, stored);
  } catch (error) {
    console.error("访问码校验失败", error);
    return c.json({ error: `访问码校验失败：${error instanceof Error ? error.message : String(error)}` }, 500);
  }
  if (!valid) {
    try {
      const failure = await recordFailedLogin(c.env.DB, sourceKey);
      if (failure.blocked) {
        return c.json(
          {
            error: `尝试次数过多，请在 ${Math.ceil(failure.retryAfterSeconds / 60)} 分钟后重试`
          },
          429
        );
      }
    } catch (error) {
      console.error("登录失败计数写入失败", error);
    }
    return c.json({ error: "访问码不正确" }, 401);
  }

  try {
    await clearLoginFailures(c.env.DB, sourceKey);
  } catch (error) {
    console.error("登录失败记录清理失败", error);
  }

  let token: string;
  try {
    token = await issueSession(c);
  } catch (error) {
    console.error("会话签发失败", error);
    return c.json({ error: `会话签发失败：${error instanceof Error ? error.message : String(error)}` }, 500);
  }
  setCookie(
    c,
    SESSION_COOKIE,
    token,
    sessionCookieOptions(c.req.url, SESSION_TTL_SECONDS)
  );

  return c.json({ ok: true });
});

app.post("/api/auth/logout", (c) => {
  setCookie(
    c,
    SESSION_COOKIE,
    "",
    sessionCookieOptions(c.req.url, 0)
  );
  return c.json({ ok: true });
});

app.route("/api/assistant", assistantRoutes);
app.route("/api/discovery", discoveryRoutes);

app.get("/api/categories", async (c) => {
  const categories = await c.env.DB.prepare(
    "SELECT id, name, sort_order AS sortOrder FROM categories ORDER BY sort_order ASC, name ASC"
  ).all();
  return c.json(categories.results);
});

app.post("/api/categories", async (c) => {
  const parsed = createCategorySchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json({ error: "分类名称需在 1 到 20 个字符之间" }, 422);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM categories WHERE name = ?"
  )
    .bind(parsed.data.name)
    .first();
  if (existing) {
    return c.json({ error: "同名分类已存在" }, 409);
  }

  const maxOrder = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM categories"
  ).first<{ maxOrder: number }>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO categories (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(id, parsed.data.name, (maxOrder?.maxOrder ?? 0) + 1, now, now)
    .run();

  return c.json(
    {
      id,
      name: parsed.data.name,
      sortOrder: (maxOrder?.maxOrder ?? 0) + 1
    },
    201
  );
});

app.patch("/api/categories/:id", async (c) => {
  const parsed = updateCategorySchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json({ error: "分类名称需在 1 到 20 个字符之间" }, 422);
  }

  const id = c.req.param("id");
  const current = await c.env.DB.prepare(
    "SELECT id, name, sort_order AS sortOrder FROM categories WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!current) {
    return c.json({ error: "分类不存在" }, 404);
  }

  const duplicate = await c.env.DB.prepare(
    "SELECT id FROM categories WHERE name = ? AND id != ?"
  )
    .bind(parsed.data.name, id)
    .first();
  if (duplicate) {
    return c.json({ error: "同名分类已存在" }, 409);
  }

  await c.env.DB.prepare(
    "UPDATE categories SET name = ?, updated_at = ? WHERE id = ?"
  )
    .bind(parsed.data.name, new Date().toISOString(), id)
    .run();

  return c.json({ ...current, name: parsed.data.name });
});

app.delete("/api/categories/:id", async (c) => {
  const id = c.req.param("id");
  const current = await c.env.DB.prepare(
    "SELECT id FROM categories WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!current) {
    return c.json({ error: "分类不存在" }, 404);
  }

  const used = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM opportunities WHERE category_id = ?"
  )
    .bind(id)
    .first<{ count: number }>();
  if ((used?.count ?? 0) > 0) {
    return c.json({ error: "分类正在被岗位使用，无法删除" }, 409);
  }

  await c.env.DB.prepare("DELETE FROM categories WHERE id = ?")
    .bind(id)
    .run();
  return c.body(null, 204);
});

app.get("/api/opportunities", async (c) => {
  const stage = c.req.query("stage");
  const categoryId = c.req.query("categoryId");
  const search = c.req.query("search");

  const conditions: string[] = [];
  const params: string[] = [];
  if (stage) {
    conditions.push("o.stage = ?");
    params.push(stage);
  }
  if (categoryId) {
    conditions.push("o.category_id = ?");
    params.push(categoryId);
  }
  if (search) {
    const like = `%${search.toLowerCase()}%`;
    conditions.push(
      "(LOWER(o.title) LIKE ? OR LOWER(COALESCE(o.company, '')) LIKE ? OR LOWER(COALESCE(o.location, '')) LIKE ?)"
    );
    params.push(like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await c.env.DB.prepare(
    `SELECT o.*, c.name AS category_name FROM opportunities o JOIN categories c ON c.id = o.category_id ${where} ORDER BY o.updated_at DESC`
  )
    .bind(...params)
    .all();
  return c.json(
    (rows.results as OpportunityRow[]).map((row) => mapOpportunity(row))
  );
});

app.post("/api/opportunities", async (c) => {
  const parsed = createOpportunitySchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json({ error: "岗位信息不完整或格式不正确" }, 422);
  }

  const category = await c.env.DB.prepare(
    "SELECT id FROM categories WHERE id = ?"
  )
    .bind(parsed.data.categoryId)
    .first();
  if (!category) {
    return c.json({ error: "岗位分类不存在" }, 404);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const values = opportunityInsertValues(parsed.data);
  await c.env.DB.prepare(
    `INSERT INTO opportunities (
      id, company, title, location, salary, category_id, stage,
      responsibilities, requirements,
      hard_abilities, general_abilities, experience_requirements,
      match_level, match_strengths, match_gaps, match_evidence,
      deadline, source_url, notes, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  )
    .bind(
      id,
      values.company,
      values.title,
      values.location,
      values.salary,
      values.categoryId,
      values.stage,
      values.responsibilities,
      values.requirements,
      values.hardAbilities,
      values.generalAbilities,
      values.experienceRequirements,
      values.matchLevel,
      values.matchStrengths,
      values.matchGaps,
      values.matchEvidence,
      values.deadline,
      values.sourceUrl,
      values.notes,
      now,
      now
    )
    .run();
  await indexOpportunity(c.env.DB, {
    id,
    company: values.company,
    title: values.title,
    location: values.location,
    salary: values.salary,
    categoryName: (category as { name?: string }).name ?? parsed.data.categoryId,
    stage: values.stage,
    responsibilities: parsed.data.responsibilities,
    requirements: parsed.data.requirements,
    abilities: parsed.data.abilities
  });

  const row = await c.env.DB.prepare(
    "SELECT o.*, c.name AS category_name FROM opportunities o JOIN categories c ON c.id = o.category_id WHERE o.id = ?"
  )
    .bind(id)
    .first();
  return c.json(mapOpportunity(row as OpportunityRow), 201);
});

app.get("/api/opportunities/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT o.*, c.name AS category_name FROM opportunities o JOIN categories c ON c.id = o.category_id WHERE o.id = ?"
  )
    .bind(id)
    .first();
  if (!row) {
    return c.json({ error: "岗位不存在" }, 404);
  }

  const images = await c.env.DB.prepare(
    "SELECT * FROM opportunity_images WHERE opportunity_id = ? ORDER BY created_at ASC"
  )
    .bind(id)
    .all();
  const interviewRounds = await c.env.DB.prepare(
    "SELECT * FROM interview_rounds WHERE opportunity_id = ? ORDER BY created_at DESC"
  )
    .bind(id)
    .all();
  const statusHistory = await c.env.DB.prepare(
    "SELECT * FROM status_history WHERE opportunity_id = ? ORDER BY changed_at DESC"
  )
    .bind(id)
    .all();

  return c.json(
    mapOpportunity(
      row as OpportunityRow,
      images.results as OpportunityImageRow[],
      interviewRounds.results as InterviewRoundRow[],
      statusHistory.results as StatusHistoryRow[]
    )
  );
});

app.patch("/api/opportunities/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = updateOpportunitySchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json({ error: "岗位信息不完整或格式不正确" }, 422);
  }

  const current = await c.env.DB.prepare(
    "SELECT version FROM opportunities WHERE id = ?"
  )
    .bind(id)
    .first<{ version: number }>();
  if (!current) {
    return c.json({ error: "岗位不存在" }, 404);
  }
  if (current.version !== parsed.data.version) {
    return c.json(
      { error: "这个岗位已在其他设备更新，请刷新后再修改" },
      409
    );
  }

  const category = await c.env.DB.prepare(
    "SELECT id FROM categories WHERE id = ?"
  )
    .bind(parsed.data.categoryId)
    .first();
  if (!category) {
    return c.json({ error: "岗位分类不存在" }, 404);
  }

  const values = opportunityInsertValues(parsed.data);
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE opportunities SET
      company = ?, title = ?, location = ?, salary = ?, category_id = ?, stage = ?,
      responsibilities = ?, requirements = ?,
      hard_abilities = ?, general_abilities = ?, experience_requirements = ?,
      match_level = ?, match_strengths = ?, match_gaps = ?, match_evidence = ?,
      deadline = ?, source_url = ?, notes = ?,
      version = version + 1, updated_at = ?
     WHERE id = ? AND version = ?`
  )
    .bind(
      values.company,
      values.title,
      values.location,
      values.salary,
      values.categoryId,
      values.stage,
      values.responsibilities,
      values.requirements,
      values.hardAbilities,
      values.generalAbilities,
      values.experienceRequirements,
      values.matchLevel,
      values.matchStrengths,
      values.matchGaps,
      values.matchEvidence,
      values.deadline,
      values.sourceUrl,
      values.notes,
      now,
      id,
      parsed.data.version
    )
    .run();
  await indexOpportunity(c.env.DB, {
    id,
    company: values.company,
    title: values.title,
    location: values.location,
    salary: values.salary,
    categoryName: (category as { name?: string }).name ?? parsed.data.categoryId,
    stage: values.stage,
    responsibilities: parsed.data.responsibilities,
    requirements: parsed.data.requirements,
    abilities: parsed.data.abilities
  });

  const updatedRow = await c.env.DB.prepare(
    "SELECT o.*, c.name AS category_name FROM opportunities o JOIN categories c ON c.id = o.category_id WHERE o.id = ?"
  )
    .bind(id)
    .first();
  return c.json(mapOpportunity(updatedRow as OpportunityRow));
});

app.patch("/api/opportunities/:id/stage", async (c) => {
  const id = c.req.param("id");
  const parsed = z
    .object({ stage: z.enum(["to_evaluate", "preparing", "submitted", "interviewing", "offer", "closed"]) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "投递阶段无效" }, 422);
  }

  const current = await c.env.DB.prepare(
    "SELECT stage FROM opportunities WHERE id = ?"
  )
    .bind(id)
    .first<{ stage: string }>();
  if (!current) {
    return c.json({ error: "岗位不存在" }, 404);
  }

  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE opportunities SET stage = ?, version = version + 1, updated_at = ? WHERE id = ?"
    ).bind(parsed.data.stage, now, id),
    c.env.DB.prepare(
      "INSERT INTO status_history (id, opportunity_id, previous_stage, new_stage, changed_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), id, current.stage, parsed.data.stage, now)
  ]);

  const row = await c.env.DB.prepare(
    "SELECT o.*, c.name AS category_name FROM opportunities o JOIN categories c ON c.id = o.category_id WHERE o.id = ?"
  )
    .bind(id)
    .first();
  return c.json(mapOpportunity(row as OpportunityRow));
});

app.post("/api/opportunities/:id/interview-rounds", async (c) => {
  const id = c.req.param("id");
  const parsed = createInterviewRoundSchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json({ error: "面试记录格式不正确" }, 422);
  }

  const opportunity = await c.env.DB.prepare(
    "SELECT id FROM opportunities WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!opportunity) {
    return c.json({ error: "岗位不存在" }, 404);
  }

  const roundId = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO interview_rounds (id, opportunity_id, round_type, scheduled_at, result, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      roundId,
      id,
      parsed.data.roundType,
      parsed.data.scheduledAt,
      parsed.data.result,
      parsed.data.notes,
      now,
      now
    )
    .run();

  const round = await c.env.DB.prepare(
    "SELECT * FROM interview_rounds WHERE id = ?"
  )
    .bind(roundId)
    .first();
  return c.json(mapInterviewRound(round as InterviewRoundRow), 201);
});

app.delete("/api/opportunities/:id", async (c) => {
  const id = c.req.param("id");
  const opportunity = await c.env.DB.prepare(
    "SELECT id FROM opportunities WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!opportunity) {
    return c.json({ error: "岗位不存在" }, 404);
  }
  const images = await c.env.DB.prepare(
    "SELECT r2_key FROM opportunity_images WHERE opportunity_id = ?"
  )
    .bind(id)
    .all<{ r2_key: string }>();
  await c.env.DB.prepare("DELETE FROM opportunities WHERE id = ?")
    .bind(id)
    .run();
  await Promise.all(
    (images.results as Array<{ r2_key: string }>).map((image) =>
      c.env.SCREENSHOTS.delete(image.r2_key)
    )
  );
  return c.body(null, 204);
});

app.get("/api/profile", async (c) => {
  const profile = await c.env.DB.prepare(
    "SELECT summary, skills, experiences, strengths, gaps, updated_at AS updatedAt FROM profile WHERE id = 1"
  ).first();
  if (!profile) {
    return c.json({
      summary: "",
      skills: [],
      experiences: [],
      strengths: [],
      gaps: [],
      updatedAt: null
    });
  }

  const row = profile as {
    summary: string;
    skills: string;
    experiences: string;
    strengths: string;
    gaps: string;
    updatedAt: string;
  };
  return c.json({
    summary: row.summary,
    skills: JSON.parse(row.skills) as string[],
    experiences: JSON.parse(row.experiences) as string[],
    strengths: JSON.parse(row.strengths) as string[],
    gaps: JSON.parse(row.gaps) as string[],
    updatedAt: row.updatedAt
  });
});

app.patch("/api/profile", async (c) => {
  const parsed = profileSchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json({ error: "能力档案格式不正确" }, 422);
  }

  const now = new Date().toISOString();
  const existing = await c.env.DB.prepare(
    "SELECT id FROM profile WHERE id = 1"
  ).first();
  if (!existing) {
    await c.env.DB.prepare(
      "INSERT INTO profile (id, summary, skills, experiences, strengths, gaps, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        parsed.data.summary,
        JSON.stringify(parsed.data.skills),
        JSON.stringify(parsed.data.experiences),
        JSON.stringify(parsed.data.strengths),
        JSON.stringify(parsed.data.gaps),
        now
      )
      .run();
  } else {
    await c.env.DB.prepare(
      "UPDATE profile SET summary = ?, skills = ?, experiences = ?, strengths = ?, gaps = ?, updated_at = ? WHERE id = 1"
    )
      .bind(
        parsed.data.summary,
        JSON.stringify(parsed.data.skills),
        JSON.stringify(parsed.data.experiences),
        JSON.stringify(parsed.data.strengths),
        JSON.stringify(parsed.data.gaps),
        now
      )
      .run();
  }

  return c.json({ ...parsed.data, updatedAt: now });
});

app.get("/api/ai-settings", async (c) => {
  const settings = await c.env.DB.prepare(
    "SELECT base_url, model, daily_limit, assistant_daily_limit FROM ai_settings WHERE id = 1"
  ).first();
  if (!settings) {
    return c.json({
      baseUrl: "",
      model: "",
      dailyLimit: 30,
      assistantDailyLimit: 50,
      hasApiKey: false
    });
  }

  const row = settings as {
    base_url: string;
    model: string;
    daily_limit: number;
    assistant_daily_limit: number;
  };
  return c.json({
    baseUrl: row.base_url,
    model: row.model,
    dailyLimit: row.daily_limit,
    assistantDailyLimit: row.assistant_daily_limit,
    hasApiKey: true
  });
});

app.post("/api/ai-usage", async (c) => {
  const result = await reserveAIRequest(c.env, toUsageDay());
  if (!result.allowed) {
    return c.json(
      {
        error: `今日识别已达 ${result.limit} 次上限，请在设置中调整上限或明天再试`
      },
      429
    );
  }
  return c.json(result, 201);
});

app.patch("/api/ai-settings", async (c) => {
  const parsed = aiSettingsSchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json({ error: "AI 设置格式不正确" }, 422);
  }

  try {
    validateAIEndpoint(parsed.data.baseUrl);
  } catch {
    return c.json({ error: "AI 接口必须是有效 HTTPS 地址" }, 422);
  }

  const now = new Date().toISOString();
  const existing = await c.env.DB.prepare(
    "SELECT id, encrypted_api_key AS encryptedApiKey FROM ai_settings WHERE id = 1"
  ).first();
  if (!existing) {
    if (!parsed.data.apiKey) {
      return c.json({ error: "首次配置必须填写 API Key" }, 422);
    }
    const encryptedApiKey = await encryptSecret(
      parsed.data.apiKey,
      c.env.AI_SECRET
    );
    await c.env.DB.prepare(
      "INSERT INTO ai_settings (id, base_url, model, encrypted_api_key, daily_limit, assistant_daily_limit, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        parsed.data.baseUrl,
        parsed.data.model,
        encryptedApiKey,
        parsed.data.dailyLimit,
        parsed.data.assistantDailyLimit,
        now
      )
      .run();
  } else {
    const encryptedApiKey = parsed.data.apiKey
      ? await encryptSecret(parsed.data.apiKey, c.env.AI_SECRET)
      : (existing as { encryptedApiKey: string }).encryptedApiKey;
    await c.env.DB.prepare(
      "UPDATE ai_settings SET base_url = ?, model = ?, encrypted_api_key = ?, daily_limit = ?, assistant_daily_limit = ?, updated_at = ? WHERE id = 1"
    )
      .bind(
        parsed.data.baseUrl,
        parsed.data.model,
        encryptedApiKey,
        parsed.data.dailyLimit,
        parsed.data.assistantDailyLimit,
        now
      )
      .run();
  }

  return c.json({
    baseUrl: parsed.data.baseUrl,
    model: parsed.data.model,
    dailyLimit: parsed.data.dailyLimit,
    assistantDailyLimit: parsed.data.assistantDailyLimit,
    hasApiKey: true
  });
});

app.get("/api/images/:id", async (c) => {
  const id = c.req.param("id");
  const image = await c.env.DB.prepare(
    "SELECT r2_key, mime_type FROM opportunity_images WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!image) {
    return c.json({ error: "图片不存在" }, 404);
  }
  const row = image as { r2_key: string; mime_type: string };
  const bytes = await c.env.SCREENSHOTS.get(row.r2_key, "arrayBuffer");
  if (!bytes) {
    return c.json({ error: "图片文件不存在" }, 404);
  }
  return new Response(bytes, {
    headers: {
      "content-type": row.mime_type,
      "cache-control": "private, max-age=3600"
    }
  });
});

app.get("/api/extraction-images/:id", async (c) => {
  const id = c.req.param("id");
  const image = await c.env.DB.prepare(
    "SELECT r2_key, mime_type FROM extraction_images WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!image) {
    return c.json({ error: "图片不存在" }, 404);
  }
  const row = image as { r2_key: string; mime_type: string };
  const bytes = await c.env.SCREENSHOTS.get(row.r2_key, "arrayBuffer");
  if (!bytes) {
    return c.json({ error: "图片文件不存在" }, 404);
  }
  return new Response(bytes, {
    headers: {
      "content-type": row.mime_type,
      "cache-control": "private, max-age=3600"
    }
  });
});

app.post("/api/extraction-jobs", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const files = Array.isArray(body.images) ? body.images : [body.images];
  const images = files.filter(
    (item): item is File =>
      item instanceof File &&
      ["image/png", "image/jpeg", "image/webp"].includes(item.type)
  );

  if (images.length === 0) {
    return c.json({ error: "请上传 PNG、JPEG 或 WebP 截图" }, 422);
  }
  if (images.length > 8) {
    return c.json({ error: "每个岗位最多上传 8 张截图" }, 422);
  }
  if (images.some((image) => image.size > 10 * 1024 * 1024)) {
    return c.json({ error: "单张截图不能超过 10MB" }, 422);
  }

  const usage = await reserveAIRequest(c.env, toUsageDay());
  if (!usage.allowed) {
    return c.json(
      {
        error: `今日识别已达 ${usage.limit} 次上限，可在设置中调整上限或明天再试`
      },
      429
    );
  }

  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  const imageRecords: {
    id: string;
    r2Key: string;
    mimeType: string;
    sortOrder: number;
    bytes: Uint8Array;
  }[] = [];

  for (const [index, image] of images.entries()) {
    const imageId = crypto.randomUUID();
    const r2Key = `job-board/${jobId}/${imageId}`;
    const bytes = new Uint8Array(await image.arrayBuffer());
    await c.env.SCREENSHOTS.put(r2Key, bytes);
    imageRecords.push({
      id: imageId,
      r2Key,
      mimeType: image.type,
      sortOrder: index + 1,
      bytes
    });
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO extraction_jobs (id, status, category_name, result, error, image_count, opportunity_id, created_at, updated_at) VALUES (?, 'queued', '待识别', NULL, NULL, ?, NULL, ?, ?)"
    ).bind(jobId, images.length, now, now),
    ...imageRecords.map((image) =>
      c.env.DB.prepare(
        "INSERT INTO extraction_images (id, job_id, r2_key, mime_type, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(image.id, jobId, image.r2Key, image.mimeType, image.sortOrder, now)
    )
  ]);

  await c.env.EXTRACTION_QUEUE.send(jobId);

  const jobRow = await c.env.DB.prepare(
    "SELECT * FROM extraction_jobs WHERE id = ?"
  )
    .bind(jobId)
    .first();
  const imageRows = await c.env.DB.prepare(
    "SELECT * FROM extraction_images WHERE job_id = ? ORDER BY sort_order ASC"
  )
    .bind(jobId)
    .all();

  return c.json(
    mapExtractionJob(
      jobRow as ExtractionJobRow,
      imageRows.results as ExtractionImageRow[]
    ),
    201
  );
});

app.get("/api/extraction-jobs/:id", async (c) => {
  const id = c.req.param("id");
  const job = await c.env.DB.prepare(
    "SELECT * FROM extraction_jobs WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!job) {
    return c.json({ error: "识别任务不存在" }, 404);
  }
  const images = await c.env.DB.prepare(
    "SELECT * FROM extraction_images WHERE job_id = ? ORDER BY sort_order ASC"
  )
    .bind(id)
    .all();
  return c.json(
    mapExtractionJob(
      job as ExtractionJobRow,
      images.results as ExtractionImageRow[]
    )
  );
});

app.post("/api/extraction-jobs/:id/retry", async (c) => {
  const id = c.req.param("id");
  const job = await c.env.DB.prepare(
    "SELECT * FROM extraction_jobs WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!job) {
    return c.json({ error: "识别任务不存在" }, 404);
  }
  if ((job as ExtractionJobRow).status !== "failed") {
    return c.json({ error: "只有失败的识别任务可以重试" }, 409);
  }

  const usage = await reserveAIRequest(c.env, toUsageDay());
  if (!usage.allowed) {
    return c.json(
      {
        error: `今日识别已达 ${usage.limit} 次上限，可在设置中调整上限或明天再试`
      },
      429
    );
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "UPDATE extraction_jobs SET status = 'queued', error = NULL, updated_at = ? WHERE id = ?"
  ).bind(now, id).run();
  await c.env.EXTRACTION_QUEUE.send(id);

  const updated = await c.env.DB.prepare(
    "SELECT * FROM extraction_jobs WHERE id = ?"
  ).bind(id).first();
  const images = await c.env.DB.prepare(
    "SELECT * FROM extraction_images WHERE job_id = ? ORDER BY sort_order ASC"
  ).bind(id).all();
  return c.json(
    mapExtractionJob(
      updated as ExtractionJobRow,
      images.results as ExtractionImageRow[]
    )
  );
});

app.post("/api/extraction-jobs/:id/confirm", async (c) => {
  const id = c.req.param("id");
  const job = await c.env.DB.prepare(
    "SELECT * FROM extraction_jobs WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!job) {
    return c.json({ error: "识别任务不存在" }, 404);
  }
  if ((job as ExtractionJobRow).status !== "awaiting_review") {
    return c.json({ error: "识别任务尚未完成，不能确认保存" }, 409);
  }

  const parsed = createOpportunitySchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json({ error: "岗位信息不完整或格式不正确" }, 422);
  }
  const category = await c.env.DB.prepare(
    "SELECT id FROM categories WHERE id = ?"
  )
    .bind(parsed.data.categoryId)
    .first();
  if (!category) {
    return c.json({ error: "岗位分类不存在" }, 404);
  }

  const opportunityId = crypto.randomUUID();
  const now = new Date().toISOString();
  const values = opportunityInsertValues(parsed.data);
  await c.env.DB.prepare(
    `INSERT INTO opportunities (
      id, company, title, location, salary, category_id, stage,
      responsibilities, requirements,
      hard_abilities, general_abilities, experience_requirements,
      match_level, match_strengths, match_gaps, match_evidence,
      deadline, source_url, notes, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  )
    .bind(
      opportunityId,
      values.company,
      values.title,
      values.location,
      values.salary,
      values.categoryId,
      values.stage,
      values.responsibilities,
      values.requirements,
      values.hardAbilities,
      values.generalAbilities,
      values.experienceRequirements,
      values.matchLevel,
      values.matchStrengths,
      values.matchGaps,
      values.matchEvidence,
      values.deadline,
      values.sourceUrl,
      values.notes,
      now,
      now
    )
    .run();

  const jobImages = await c.env.DB.prepare(
    "SELECT * FROM extraction_images WHERE job_id = ? ORDER BY sort_order ASC"
  )
    .bind(id)
    .all();
  await c.env.DB.batch([
    ...(jobImages.results as ExtractionImageRow[]).map((image) =>
      c.env.DB.prepare(
        "INSERT INTO opportunity_images (id, opportunity_id, r2_key, mime_type, created_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(
        crypto.randomUUID(),
        opportunityId,
        image.r2_key,
        image.mime_type,
        now
      )
    ),
    c.env.DB.prepare(
      "UPDATE extraction_jobs SET status = 'confirmed', opportunity_id = ?, updated_at = ? WHERE id = ?"
    ).bind(opportunityId, now, id)
  ]);

  const opportunityRow = await c.env.DB.prepare(
    "SELECT o.*, c.name AS category_name FROM opportunities o JOIN categories c ON c.id = o.category_id WHERE o.id = ?"
  )
    .bind(opportunityId)
    .first();
  const opportunityImages = await c.env.DB.prepare(
    "SELECT * FROM opportunity_images WHERE opportunity_id = ? ORDER BY created_at ASC"
  )
    .bind(opportunityId)
    .all();
  const interviewRounds = await c.env.DB.prepare(
    "SELECT * FROM interview_rounds WHERE opportunity_id = ? ORDER BY created_at DESC"
  )
    .bind(opportunityId)
    .all();
  const statusHistory = await c.env.DB.prepare(
    "SELECT * FROM status_history WHERE opportunity_id = ? ORDER BY changed_at DESC"
  )
    .bind(opportunityId)
    .all();

  return c.json(
    mapOpportunity(
      opportunityRow as OpportunityRow,
      opportunityImages.results as OpportunityImageRow[],
      interviewRounds.results as InterviewRoundRow[],
      statusHistory.results as StatusHistoryRow[]
    ),
    201
  );
});

app.get("*", async (c) => {
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (asset.status !== 404) {
    return asset;
  }
  const index = await c.env.ASSETS.fetch(
    new Request(new URL("/", c.req.url), c.req.raw)
  );
  return new Response(index.body, {
    status: index.status,
    headers: index.headers
  });
});

export default app;

import { Hono } from "hono";

import type { JobBoardEnv } from "./env";
import { indexOpportunity } from "./assistantRepository";
import {
  canStartManualDiscovery,
  createDiscoveryRun,
  getDiscoveryOverview,
  getDiscoveryPreferences,
  getRecommendation,
  pruneDiscoveryRecommendations,
  saveDiscoveryPreferences,
  updateRecommendationState
} from "./discoveryRepository";
import {
  createOpportunitySchema,
  mapOpportunity,
  opportunityInsertValues,
  type OpportunityRow
} from "./opportunity";

const discovery = new Hono<{ Bindings: JobBoardEnv }>();

discovery.get("/preferences", async (c) =>
  c.json(await getDiscoveryPreferences(c.env.DB))
);

discovery.patch("/preferences", async (c) => {
  try {
    const parsed = await c.req.json().catch(() => null);
    const preferences = await saveDiscoveryPreferences(c.env.DB, parsed);
    return c.json(preferences);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "求职偏好格式不正确" },
      422
    );
  }
});

discovery.get("/", async (c) => {
  await pruneDiscoveryRecommendations(c.env.DB);
  return c.json(await getDiscoveryOverview(c.env.DB));
});

discovery.post("/runs", async (c) => {
  const allowance = await canStartManualDiscovery(c.env.DB);
  if (!allowance.allowed) {
    return c.json(
      {
        error: allowance.reason ?? "现在不能运行岗位发现",
        nextAllowedAt: allowance.nextAllowedAt
      },
      429
    );
  }
  const run = await createDiscoveryRun(c.env.DB, "manual");
  try {
    await c.env.DISCOVERY_QUEUE.send(run.id);
  } catch (error) {
    await c.env.DB.prepare(
      "UPDATE job_discovery_runs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?"
    ).bind(
      error instanceof Error ? error.message : "队列投递失败",
      new Date().toISOString(),
      run.id
    ).run();
    return c.json({ error: "岗位发现任务投递失败" }, 500);
  }
  return c.json(run, 201);
});

discovery.post("/recommendations/:id/ignore", async (c) => {
  const recommendation = await getRecommendation(c.env.DB, c.req.param("id"));
  if (!recommendation) return c.json({ error: "推荐不存在" }, 404);
  if (recommendation.state !== "new") {
    return c.json({ error: "该推荐已经处理" }, 409);
  }
  await updateRecommendationState(c.env.DB, recommendation.id, "ignored");
  return c.body(null, 204);
});

discovery.post("/recommendations/:id/save", async (c) => {
  const recommendation = await getRecommendation(c.env.DB, c.req.param("id"));
  if (!recommendation) return c.json({ error: "推荐不存在" }, 404);
  if (recommendation.state !== "new") {
    return c.json({ error: "该推荐已经处理" }, 409);
  }
  const parsed = createOpportunitySchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json({ error: "岗位信息不完整或格式不正确" }, 422);
  }
  const category = await c.env.DB.prepare(
    "SELECT id, name FROM categories WHERE id = ?"
  ).bind(parsed.data.categoryId).first<{ id: string; name: string }>();
  if (!category) return c.json({ error: "岗位分类不存在" }, 404);
  const duplicate = await c.env.DB.prepare(
    "SELECT id FROM opportunities WHERE source_url = ? OR (LOWER(COALESCE(company, '')) = LOWER(?) AND LOWER(title) = LOWER(?) AND LOWER(COALESCE(location, '')) = LOWER(?)) LIMIT 1"
  ).bind(
    parsed.data.sourceUrl ?? recommendation.canonicalUrl,
    parsed.data.company ?? "",
    parsed.data.title,
    parsed.data.location ?? ""
  ).first<{ id: string }>();
  if (duplicate) return c.json({ error: "这个岗位已经在岗位库中" }, 409);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const values = opportunityInsertValues({
    ...parsed.data,
    sourceUrl: parsed.data.sourceUrl ?? recommendation.sourceUrl
  });
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO opportunities (
        id, company, title, location, salary, category_id, stage,
        responsibilities, requirements, hard_abilities, general_abilities,
        experience_requirements, match_level, match_strengths, match_gaps,
        match_evidence, deadline, source_url, notes, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(
      id, values.company, values.title, values.location, values.salary,
      values.categoryId, values.stage, values.responsibilities,
      values.requirements, values.hardAbilities, values.generalAbilities,
      values.experienceRequirements, values.matchLevel, values.matchStrengths,
      values.matchGaps, values.matchEvidence, values.deadline, values.sourceUrl,
      values.notes, now, now
    ),
    c.env.DB.prepare(
      "UPDATE job_recommendations SET state = 'saved', saved_opportunity_id = ?, updated_at = ? WHERE id = ?"
    ).bind(id, now, recommendation.id)
  ]);
  await indexOpportunity(c.env.DB, {
    id,
    company: values.company,
    title: values.title,
    location: values.location,
    salary: values.salary,
    categoryName: category.name,
    stage: values.stage,
    responsibilities: parsed.data.responsibilities,
    requirements: parsed.data.requirements,
    abilities: parsed.data.abilities
  });
  const row = await c.env.DB.prepare(
    "SELECT o.*, c.name AS category_name FROM opportunities o JOIN categories c ON c.id = o.category_id WHERE o.id = ?"
  ).bind(id).first<OpportunityRow>();
  return c.json(mapOpportunity(row as OpportunityRow), 201);
});

export default discovery;

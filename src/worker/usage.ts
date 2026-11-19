export type UsageEnv = {
  DB: D1Database;
};

export function toUsageDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function reserveAIRequest(
  env: UsageEnv,
  day = toUsageDay()
): Promise<{ allowed: true; used: number; limit: number } | { allowed: false; used: number; limit: number }> {
  const settings = await env.DB.prepare(
    "SELECT daily_limit AS dailyLimit FROM ai_settings WHERE id = 1"
  ).first<{ dailyLimit: number }>();
  const limit = settings?.dailyLimit ?? 30;
  const usage = await env.DB.prepare(
    "SELECT request_count AS requestCount FROM ai_usage WHERE day = ?"
  )
    .bind(day)
    .first<{ requestCount: number }>();
  const used = usage?.requestCount ?? 0;
  if (used >= limit) {
    return { allowed: false, used, limit };
  }
  await env.DB.prepare(
    "INSERT INTO ai_usage (day, request_count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET request_count = request_count + 1"
  )
    .bind(day)
    .run();
  return { allowed: true, used: used + 1, limit };
}

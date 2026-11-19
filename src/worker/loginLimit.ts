type LoginLimitDB = Pick<D1Database, "prepare">;

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_BLOCK_MS = 15 * 60 * 1000;

type AttemptRow = {
  failed_count: number;
  window_started_at: string;
  blocked_until: string | null;
};

export type LoginLimitResult = {
  blocked: boolean;
  failedCount: number;
  retryAfterSeconds: number;
};

function retryAfterSeconds(blockedUntil: number, now: Date): number {
  return Math.max(1, Math.ceil((blockedUntil - now.getTime()) / 1000));
}

export async function checkLoginBlock(
  DB: LoginLimitDB,
  sourceKey: string,
  now = new Date()
): Promise<LoginLimitResult | null> {
  const row = await DB.prepare(
    "SELECT failed_count, window_started_at, blocked_until FROM login_attempts WHERE source_key = ?"
  )
    .bind(sourceKey)
    .first<AttemptRow>();
  if (!row?.blocked_until) return null;
  const blockedUntil = new Date(row.blocked_until).getTime();
  if (!Number.isFinite(blockedUntil) || blockedUntil <= now.getTime()) {
    return null;
  }
  return {
    blocked: true,
    failedCount: row.failed_count,
    retryAfterSeconds: retryAfterSeconds(blockedUntil, now)
  };
}

export async function recordFailedLogin(
  DB: LoginLimitDB,
  sourceKey: string,
  now = new Date()
): Promise<LoginLimitResult> {
  const row = await DB.prepare(
    "SELECT failed_count, window_started_at, blocked_until FROM login_attempts WHERE source_key = ?"
  )
    .bind(sourceKey)
    .first<AttemptRow>();
  const nowTime = now.getTime();
  const windowStart = row ? new Date(row.window_started_at).getTime() : 0;
  const withinWindow =
    row && Number.isFinite(windowStart) && nowTime - windowStart < LOGIN_WINDOW_MS;
  const failedCount = withinWindow ? row.failed_count + 1 : 1;
  const windowStartedAt = withinWindow
    ? row.window_started_at
    : now.toISOString();
  const blockedUntil =
    failedCount === LOGIN_MAX_FAILURES
      ? new Date(nowTime + LOGIN_BLOCK_MS).toISOString()
      : row?.blocked_until ?? null;

  const sql = row
    ? "UPDATE login_attempts SET failed_count = ?, window_started_at = ?, blocked_until = ?, updated_at = ? WHERE source_key = ?"
    : "INSERT INTO login_attempts (failed_count, window_started_at, blocked_until, updated_at, source_key) VALUES (?, ?, ?, ?, ?)";
  const values = [
    failedCount,
    windowStartedAt,
    blockedUntil,
    now.toISOString(),
    sourceKey
  ] as const;
  await DB.prepare(sql).bind(...values).run();

  return {
    blocked: failedCount > LOGIN_MAX_FAILURES,
    failedCount,
    retryAfterSeconds: blockedUntil && failedCount > LOGIN_MAX_FAILURES
      ? retryAfterSeconds(new Date(blockedUntil).getTime(), now)
      : 0
  };
}

export async function clearLoginFailures(
  DB: LoginLimitDB,
  sourceKey: string
): Promise<void> {
  await DB.prepare("DELETE FROM login_attempts WHERE source_key = ?")
    .bind(sourceKey)
    .run();
}

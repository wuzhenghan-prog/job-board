import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type D1Result<T> = {
  results: T[];
  success: boolean;
};

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  first: <T = unknown>() => Promise<T | null>;
  all: <T = unknown>() => Promise<T[]>;
  run: <T = unknown>() => Promise<D1Result<T>>;
};

export type FakeD1 = {
  prepare: (sql: string) => D1PreparedStatement;
  batch: (statements: D1PreparedStatement[]) => Promise<unknown[]>;
  exec: (sql: string) => Promise<void>;
};

export function createFakeD1(): FakeD1 {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");

  const migrationPath = new URL(
    "../../migrations/0001_initial.sql",
    import.meta.url
  );
  database.exec(readFileSync(fileURLToPath(migrationPath), "utf8"));
  const assistantMigrationPath = new URL(
    "../../migrations/0003_ai_assistant.sql",
    import.meta.url
  );
  database.exec(readFileSync(fileURLToPath(assistantMigrationPath), "utf8"));
  for (const migration of [
    "0004_backfill_assistant_index.sql",
    "0005_salary_field.sql",
    "0006_backfill_assistant_salary.sql",
    "0007_job_discovery.sql",
    "0008_discovery_funnel.sql"
  ]) {
    database.exec(
      readFileSync(
        fileURLToPath(new URL(`../../migrations/${migration}`, import.meta.url)),
        "utf8"
      )
    );
  }

  const wrapStatement = (sql: string): D1PreparedStatement => {
    const statement = database.prepare(sql);
    const bound: unknown[] = [];
    const normalizeRow = (row: Record<string, unknown>) => {
      const normalized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[key] = value;
      }
      return normalized;
    };

    const bind = (...values: unknown[]) => {
      bound.push(...values);
      return wrapped;
    };

    const first = async <T = unknown>(): Promise<T | null> => {
      const row = statement.get(...bound) as Record<string, unknown> | undefined;
      return (row ? normalizeRow(row) : null) as T | null;
    };

    const all = async <T = unknown>(): Promise<{ results: T[]; success: boolean }> => {
      const rows = statement.all(...bound) as Array<Record<string, unknown>>;
      return { results: rows.map(normalizeRow) as T[], success: true };
    };

    const run = async <T = unknown>(): Promise<D1Result<T>> => {
      statement.run(...bound);
      return { results: [], success: true };
    };

    const wrapped: D1PreparedStatement = { bind, first, all, run };
    return wrapped;
  };

  return {
    prepare: (sql: string) => wrapStatement(sql),
    batch: async (statements) => {
      const results: unknown[] = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    },
    exec: async (sql: string) => {
      database.exec(sql);
    }
  };
}

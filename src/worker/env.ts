/// <reference types="@cloudflare/workers-types" />

export type JobBoardEnv = {
  DB: D1Database;
  SCREENSHOTS: KVNamespace;
  EXTRACTION_QUEUE: Queue<string>;
  DISCOVERY_QUEUE: Queue<string>;
  ASSETS: Fetcher;
  SESSION_SECRET: string;
  AI_SECRET: string;
};

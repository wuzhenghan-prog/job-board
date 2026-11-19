import { beforeEach, describe, expect, it } from "vitest";

import worker from "../src/worker/app";
import { createFakeD1 } from "./helpers/fakeD1";

describe("job board API", () => {
  beforeEach(() => {
    // New in-memory database per test.
  });

  it("reports health", async () => {
    const response = await worker.request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("rejects unauthenticated category access", async () => {
    const db = createFakeD1();
    const response = await worker.request("/api/categories", {}, { DB: db });
    expect(response.status).toBe(401);
  });

  it("sets access code and returns preset categories after login", async () => {
    const db = createFakeD1();
    const env = {
      DB: db,
      SCREENSHOTS: {} as never,
      EXTRACTION_QUEUE: { send: async () => ({ id: "queued" }) } as never,
      SESSION_SECRET: "test-session-secret",
      AI_SECRET: "test-ai-secret",
      ASSETS: { fetch: async () => new Response("not found", { status: 404 }) } as never
    };

    const setup = await worker.request(
      "https://job-board.example.com/api/auth/setup",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessCode: "personal-access-code" })
      },
      env
    );
    expect(setup.status).toBe(201);
    expect(setup.headers.get("set-cookie")).toContain("HttpOnly");

    const login = await worker.request(
      "https://job-board.example.com/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessCode: "personal-access-code" })
      },
      env
    );
    expect(login.status).toBe(200);
    const setCookie = login.headers.get("set-cookie");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");

    const cookie = extractCookie(setCookie);
    const categoriesResponse = await worker.request(
      "/api/categories",
      { headers: { cookie } },
      env
    );
    expect(categoriesResponse.status).toBe(200);
    const categories = await categoriesResponse.json();
    expect(categories).toHaveLength(8);
    expect(categories.map((category: { name: string }) => category.name)).toContain("研发");
  });

  it("rate limits repeated wrong access codes", async () => {
    const db = createFakeD1();
    const env = {
      DB: db,
      SCREENSHOTS: {} as never,
      EXTRACTION_QUEUE: { send: async () => ({ id: "queued" }) } as never,
      SESSION_SECRET: "test-session-secret",
      AI_SECRET: "test-ai-secret",
      ASSETS: { fetch: async () => new Response("not found", { status: 404 }) } as never
    };
    await worker.request(
      "/api/auth/setup",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessCode: "correct-access-code" })
      },
      env
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await worker.request(
        "https://job-board.example.com/api/auth/login",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "CF-Connecting-IP": "203.0.113.50"
          },
          body: JSON.stringify({ accessCode: "wrong-access-code" })
        },
        env
      );
      expect(response.status).toBe(401);
    }

    const blocked = await worker.request(
      "https://job-board.example.com/api/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "CF-Connecting-IP": "203.0.113.50"
        },
        body: JSON.stringify({ accessCode: "correct-access-code" })
      },
      env
    );
    expect(blocked.status).toBe(429);
  });
});

function extractCookie(setCookie: string | null): string {
  return (setCookie ?? "").split(";")[0];
}

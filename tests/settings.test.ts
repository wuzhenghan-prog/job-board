import { describe, expect, it } from "vitest";

import worker from "../src/worker/app";
import { createAuthenticatedTestEnv } from "./helpers/api";

describe("profile and AI settings API", () => {
  it("returns default profile and saves an edited profile", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const initialResponse = await worker.request(
      "/api/profile",
      { headers: { cookie } },
      env
    );
    expect(initialResponse.status).toBe(200);
    expect(await initialResponse.json()).toMatchObject({
      summary: "",
      skills: [],
      experiences: [],
      strengths: [],
      gaps: []
    });

    const updateResponse = await worker.request(
      "/api/profile",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          summary: "微电子本科生，偏向 AI 应用与项目管理",
          skills: ["数据分析", "跨团队沟通"],
          experiences: ["负责 RC-IGBT 结构优化项目"],
          strengths: ["目标拆解", "团队协调"],
          gaps: ["缺少平台产品实习"]
        })
      },
      env
    );
    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated).toMatchObject({
      summary: "微电子本科生，偏向 AI 应用与项目管理",
      skills: ["数据分析", "跨团队沟通"]
    });
  });

  it("saves AI settings without exposing the API key", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const response = await worker.request(
      "/api/ai-settings",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          baseUrl: "https://api.example.com/v1/chat/completions",
          model: "vision-model",
          apiKey: "sk-test-key",
          dailyLimit: 30,
          assistantDailyLimit: 50
        })
      },
      env
    );
    expect(response.status).toBe(200);
    const settings = await response.json();
    expect(settings).toMatchObject({
      baseUrl: "https://api.example.com/v1/chat/completions",
      model: "vision-model",
      dailyLimit: 30,
      assistantDailyLimit: 50,
      hasApiKey: true
    });
    expect(JSON.stringify(settings)).not.toContain("sk-test-key");

    const stored = await env.DB.prepare(
      "SELECT encrypted_api_key FROM ai_settings WHERE id = 1"
    ).first<{ encrypted_api_key: string }>();
    expect(stored?.encrypted_api_key).not.toContain("sk-test-key");
  });

  it("reserves a daily AI request and blocks calls beyond the configured limit", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    await worker.request(
      "/api/ai-settings",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          baseUrl: "https://api.example.com/v1/chat/completions",
          model: "vision-model",
          apiKey: "sk-test-key",
          dailyLimit: 2
        })
      },
      env
    );

    for (const status of [201, 201, 429]) {
      const response = await worker.request(
        "/api/ai-usage",
        { method: "POST", headers: { cookie } },
        env
      );
      expect(response.status).toBe(status);
    }
  });

  it("keeps the existing API key when only the daily limit changes", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    await worker.request(
      "/api/ai-settings",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          baseUrl: "https://api.example.com/v1/chat/completions",
          model: "vision-model",
          apiKey: "existing-secret",
          dailyLimit: 30
        })
      },
      env
    );
    const response = await worker.request(
      "/api/ai-settings",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          baseUrl: "https://api.example.com/v1/chat/completions",
          model: "vision-model-v2",
          apiKey: "",
          dailyLimit: 45
        })
      },
      env
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      model: "vision-model-v2",
      dailyLimit: 45,
      hasApiKey: true
    });
    const stored = await env.DB.prepare(
      "SELECT encrypted_api_key FROM ai_settings WHERE id = 1"
    ).first<{ encrypted_api_key: string }>();
    expect(stored?.encrypted_api_key).toBeTruthy();
  });
});

import { describe, expect, it } from "vitest";

import worker from "../src/worker/app";
import { createAuthenticatedTestEnv } from "./helpers/api";

describe("categories API", () => {
  it("creates, updates and deletes a custom category", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const createResponse = await worker.request(
      "/api/categories",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "算法研究" })
      },
      env
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created).toMatchObject({ name: "算法研究" });

    const updateResponse = await worker.request(
      `/api/categories/${created.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "算法工程" })
      },
      env
    );
    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toMatchObject({
      name: "算法工程"
    });

    const deleteResponse = await worker.request(
      `/api/categories/${created.id}`,
      { method: "DELETE", headers: { cookie } },
      env
    );
    expect(deleteResponse.status).toBe(204);

    const listResponse = await worker.request(
      "/api/categories",
      { headers: { cookie } },
      env
    );
    const categories = await listResponse.json();
    expect(categories.map((category: { name: string }) => category.name)).not.toContain("算法工程");
  });

  it("rejects duplicate category names", async () => {
    const { env, cookie } = await createAuthenticatedTestEnv();
    const response = await worker.request(
      "/api/categories",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "研发" })
      },
      env
    );
    expect(response.status).toBe(409);
  });
});

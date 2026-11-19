import worker from "../../src/worker/app";
import { createFakeD1 } from "./fakeD1";

export async function createAuthenticatedTestEnv() {
  const db = createFakeD1();
  const storedObjects = new Map<string, Uint8Array>();
  const discoveryMessages: string[] = [];
  const env = {
    DB: db,
    SCREENSHOTS: {
      put: async (key: string, value: Uint8Array | ArrayBuffer) => {
        storedObjects.set(
          key,
          value instanceof Uint8Array ? value : new Uint8Array(value)
        );
        return { key };
      },
      get: async (key: string) => {
        const value = storedObjects.get(key);
        return value
          ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
          : null;
      },
      delete: async (key: string) => storedObjects.delete(key)
    } as never,
    EXTRACTION_QUEUE: {
      send: async () => ({ id: "queued" })
    } as never,
    DISCOVERY_QUEUE: {
      send: async (message: string) => {
        discoveryMessages.push(message);
        return { id: "queued" };
      }
    } as never,
    ASSETS: {
      fetch: async () => new Response("not found", { status: 404 })
    } as never,
    SESSION_SECRET: "test-session-secret",
    AI_SECRET: "test-ai-secret"
  };

  const setup = await worker.request(
    "/api/auth/setup",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessCode: "personal-access-code" })
    },
    env
  );
  if (setup.status !== 201) {
    throw new Error("Failed to set up access code");
  }

  const login = await worker.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessCode: "personal-access-code" })
    },
    env
  );
  if (login.status !== 200) {
    throw new Error("Failed to login");
  }

  const setCookie = login.headers.get("set-cookie");
  const cookie = (setCookie ?? "").split(";")[0];
  return { env, cookie, discoveryMessages };
}

export async function requestJson<T>(
  path: string,
  init: RequestInit,
  env: unknown
): Promise<T> {
  const response = await worker.request(path, init, env);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status}: ${body}`);
  }
  return JSON.parse(body) as T;
}

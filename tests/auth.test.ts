import { describe, expect, it } from "vitest";

import {
  hashAccessCode,
  MAX_CLOUDFLARE_PBKDF2_ITERATIONS,
  signSession,
  verifyAccessCode,
  verifySession
} from "../src/worker/auth";

describe("access code", () => {
  it("accepts the correct code and rejects another code", async () => {
    const stored = await hashAccessCode("correct-horse-2026");

    await expect(verifyAccessCode("correct-horse-2026", stored)).resolves.toBe(
      true
    );
    await expect(verifyAccessCode("wrong-code", stored)).resolves.toBe(false);
  });

  it("uses a unique salt for each stored code", async () => {
    const first = await hashAccessCode("same-code");
    const second = await hashAccessCode("same-code");

    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });

  it("uses an iteration count supported by the Cloudflare runtime", async () => {
    const stored = await hashAccessCode("supported-code");
    expect(stored.iterations).toBe(MAX_CLOUDFLARE_PBKDF2_ITERATIONS);
    expect(stored.iterations).toBe(100_000);
  });
});

describe("session tokens", () => {
  it("verifies a signed unexpired token", async () => {
    const token = await signSession(
      { sub: "owner", exp: 2_000_000_000 },
      "session-secret"
    );

    await expect(
      verifySession(token, "session-secret", 1_900_000_000)
    ).resolves.toEqual({ sub: "owner", exp: 2_000_000_000 });
  });

  it("rejects an expired token", async () => {
    const token = await signSession(
      { sub: "owner", exp: 1_000 },
      "session-secret"
    );

    await expect(
      verifySession(token, "session-secret", 1_001)
    ).resolves.toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession(
      { sub: "owner", exp: 2_000_000_000 },
      "first-secret"
    );

    await expect(
      verifySession(token, "second-secret", 1_900_000_000)
    ).resolves.toBeNull();
  });
});

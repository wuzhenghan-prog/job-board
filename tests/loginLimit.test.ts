import { describe, expect, it } from "vitest";

import {
  LOGIN_BLOCK_MS,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  recordFailedLogin
} from "../src/worker/loginLimit";
import { createFakeD1 } from "./helpers/fakeD1";

describe("login failure limiting", () => {
  it("blocks after five failures in a window", async () => {
    const DB = createFakeD1();
    const start = new Date("2026-11-13T02:00:00.000Z");
    let result;
    for (let index = 0; index < LOGIN_MAX_FAILURES; index += 1) {
      result = await recordFailedLogin(DB, "203.0.113.10", start);
      expect(result.blocked).toBe(false);
    }
    expect(result).toMatchObject({ failedCount: LOGIN_MAX_FAILURES });
    expect(
      await recordFailedLogin(DB, "203.0.113.10", start)
    ).toMatchObject({
      blocked: true,
      retryAfterSeconds: LOGIN_BLOCK_MS / 1000
    });
  });

  it("keeps blocking for fifteen minutes and then clears the attempt", async () => {
    const DB = createFakeD1();
    const start = new Date("2026-11-13T02:00:00.000Z");
    for (let index = 0; index < LOGIN_MAX_FAILURES; index += 1) {
      await recordFailedLogin(DB, "203.0.113.11", start);
    }
    expect(
      await recordFailedLogin(
        DB,
        "203.0.113.11",
        new Date(start.getTime() + LOGIN_BLOCK_MS - 1)
      )
    ).toMatchObject({ blocked: true, retryAfterSeconds: 1 });

    expect(
      await recordFailedLogin(
        DB,
        "203.0.113.11",
        new Date(start.getTime() + LOGIN_BLOCK_MS)
      )
    ).toMatchObject({ blocked: false, failedCount: 1 });
  });

  it("expires old failure windows", async () => {
    const DB = createFakeD1();
    const start = new Date("2026-11-13T02:00:00.000Z");
    for (let index = 0; index < 3; index += 1) {
      await recordFailedLogin(DB, "203.0.113.12", start);
    }
    expect(
      await recordFailedLogin(
        DB,
        "203.0.113.12",
        new Date(start.getTime() + LOGIN_WINDOW_MS + 1)
      )
    ).toMatchObject({ blocked: false, failedCount: 1 });
  });
});

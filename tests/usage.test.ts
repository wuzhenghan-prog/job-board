import { describe, expect, it } from "vitest";

import { createFakeD1 } from "./helpers/fakeD1";
import { reserveAIRequest, toUsageDay } from "../src/worker/usage";

describe("AI usage guard", () => {
  it("uses UTC dates", () => {
    expect(toUsageDay(new Date("2026-11-12T23:59:59.000Z"))).toBe("2026-11-12");
  });

  it("defaults to 30 calls and blocks the 31st", async () => {
    const db = createFakeD1();
    for (let index = 0; index < 30; index += 1) {
      expect(await reserveAIRequest({ DB: db }, "2026-11-12")).toMatchObject({
        allowed: true
      });
    }
    expect(await reserveAIRequest({ DB: db }, "2026-11-12")).toEqual({
      allowed: false,
      used: 30,
      limit: 30
    });
  });
});

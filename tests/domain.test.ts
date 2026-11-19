import { describe, expect, it } from "vitest";

import { CATEGORY_PRESETS, STAGES } from "../src/shared/domain";

describe("domain constants", () => {
  it("has six unique ordered stages", () => {
    expect(STAGES.map((stage) => stage.value)).toEqual([
      "to_evaluate",
      "preparing",
      "submitted",
      "interviewing",
      "offer",
      "closed"
    ]);
    expect(new Set(STAGES.map((stage) => stage.label)).size).toBe(6);
  });

  it("has all promised categories without duplicates", () => {
    expect(new Set(CATEGORY_PRESETS).size).toBe(CATEGORY_PRESETS.length);
    expect(CATEGORY_PRESETS).toContain("研发");
    expect(CATEGORY_PRESETS).toContain("产品");
    expect(CATEGORY_PRESETS).toContain("项目管理");
    expect(CATEGORY_PRESETS).toContain("运营");
  });

  it("assigns one low-saturation semantic tone to every stage", () => {
    expect(STAGES.map((stage) => stage.tone)).toEqual([
      "slate",
      "blue",
      "teal",
      "amber",
      "sage",
      "warm"
    ]);
    expect(new Set(STAGES.map((stage) => stage.tone)).size).toBe(6);
  });
});

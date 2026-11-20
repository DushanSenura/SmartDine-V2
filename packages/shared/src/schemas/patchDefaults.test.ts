import { describe, expect, it } from "vitest";

import * as shared from "../index";

/**
 * A PATCH carries only what changed. If an update schema filled in defaults, an empty or partial
 * body would silently reset stored data (allergies, images and amenities, branch limits, floors…).
 * Every exported `update*Schema` is checked, so a new one can't reintroduce the problem.
 */
const updateSchemas = Object.entries(shared).filter(([name]) => /^update\w*Schema$/.test(name));

describe("update schemas leave omitted fields alone", () => {
  it("finds the update schemas", () => {
    expect(updateSchemas.length).toBeGreaterThan(15);
  });

  it.each(updateSchemas)("%s", (_name, schema) => {
    const result = (
      schema as { safeParse: (v: unknown) => { success: boolean; data?: object } }
    ).safeParse({});
    // Either an empty body is rejected outright, or it parses to nothing at all.
    if (result.success) expect(result.data).toEqual({});
  });

  it("still validates what is sent", () => {
    expect(shared.updatePromotionSchema.safeParse({ type: "PERCENTAGE", value: 150 }).success).toBe(
      false,
    );
    expect(shared.updateInventoryItemSchema.safeParse({ cost: -1 }).success).toBe(false);
  });
});

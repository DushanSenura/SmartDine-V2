import { describe, expect, it } from "vitest";

import { escapeLike } from "./prisma";

describe("escapeLike", () => {
  it("makes LIKE wildcards literal", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("%%")).toBe("\\%\\%");
  });

  it("escapes the escape character itself, and leaves ordinary text alone", () => {
    expect(escapeLike("a\\b")).toBe("a\\\\b");
    expect(escapeLike("Ada Lovelace")).toBe("Ada Lovelace");
    expect(escapeLike("")).toBe("");
  });
});

import { describe, expect, it } from "vitest";

import { postLoginPath } from "./roleHome";

describe("postLoginPath", () => {
  it("returns users to the page they came from", () => {
    expect(postLoginPath("CUSTOMER", "/reservations?tab=private")).toBe(
      "/reservations?tab=private",
    );
    expect(postLoginPath("MANAGER", "/app/menu")).toBe("/app/menu");
  });

  it("falls back to the role home without a usable target", () => {
    expect(postLoginPath("WAITER", undefined)).toBe("/app/waiter");
    expect(postLoginPath("CUSTOMER", 42)).toBe("/account");
  });

  it("never sends customers into the staff app", () => {
    expect(postLoginPath("CUSTOMER", "/app/owner")).toBe("/account");
  });

  it("rejects off-site and protocol-relative targets", () => {
    expect(postLoginPath("CUSTOMER", "https://evil.example")).toBe("/account");
    expect(postLoginPath("CUSTOMER", "//evil.example/x")).toBe("/account");
  });
});

import type { Request } from "express";
import { describe, expect, it } from "vitest";

import { signAccessToken } from "../modules/auth/token.service";
import { globalKey } from "./rateLimit";

const request = (authorization?: string, ip = "203.0.113.7") =>
  ({ headers: { authorization }, ip }) as unknown as Request;

describe("global rate-limit key", () => {
  it("counts a signed-in user on their own, so a shared network address doesn't pool everyone", () => {
    const a = signAccessToken({ userId: "user-a", role: "WAITER", branchId: null });
    const b = signAccessToken({ userId: "user-b", role: "KITCHEN", branchId: null });
    expect(globalKey(request(`Bearer ${a}`))).toBe("user:user-a");
    expect(globalKey(request(`Bearer ${b}`))).toBe("user:user-b");
    // Same address, different people, different budgets.
    expect(globalKey(request(`Bearer ${a}`))).not.toBe(globalKey(request(`Bearer ${b}`)));
  });

  it("falls back to the address for anonymous callers and for tokens that do not verify", () => {
    expect(globalKey(request())).toBe("203.0.113.7");
    expect(globalKey(request("Bearer not-a-real-token"))).toBe("203.0.113.7");
    // A forged token must not buy a fresh budget per request.
    expect(globalKey(request("Bearer forged.token.value"))).toBe(globalKey(request()));
  });
});

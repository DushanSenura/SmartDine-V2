import type { AuthSession } from "@smartdine/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/stores/authStore";

import { apiRequest } from "./client";

const session = (accessToken: string): AuthSession => ({
  accessToken,
  user: {
    id: "1",
    email: "a@b.c",
    firstName: "A",
    lastName: "B",
    phone: null,
    role: "WAITER",
    permissions: [],
    branchId: null,
  },
});

const ok = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data, meta: {} }), { status: 200 });
const unauthorized = () =>
  new Response(
    JSON.stringify({ success: false, error: { code: "UNAUTHENTICATED", message: "expired" } }),
    { status: 401 },
  );

describe("apiRequest session renewal", () => {
  beforeEach(() => useAuthStore.getState().setSession(session("old")));
  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().clear();
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(ok(session("new")))
      .mockResolvedValueOnce(ok({ hello: "world" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/thing")).resolves.toEqual({ hello: "world" });

    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v2/auth/refresh");
    const retryHeaders = fetchMock.mock.calls[2]?.[1]?.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe("Bearer new");
  });

  it("signs the user out when the refresh fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(unauthorized()),
    );
    await expect(apiRequest("/thing")).rejects.toMatchObject({ status: 401 });
    expect(useAuthStore.getState().status).toBe("anonymous");
  });

  it("shares one refresh between concurrent 401s", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/auth/refresh")) return ok(session("new"));
      const auth = useAuthStore.getState().accessToken;
      return auth === "new" ? ok({ n: 1 }) : unauthorized();
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([apiRequest("/a"), apiRequest("/b")]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url.endsWith("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
  });
});

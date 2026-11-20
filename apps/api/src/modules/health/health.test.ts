import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock("../../config/database", () => ({
  prisma: { $queryRaw: queryRaw, $disconnect: vi.fn() },
}));

const { createApp } = await import("../../app");

describe("health endpoints", () => {
  const app = createApp();

  beforeEach(() => {
    queryRaw.mockReset();
  });

  it("GET /api/v2/health returns the success envelope", async () => {
    const res = await request(app).get("/api/v2/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: "ok" }, meta: {} });
  });

  it("GET /api/v2/health/ready is ready when the database answers", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const res = await request(app).get("/api/v2/health/ready");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "ready", database: "up" });
  });

  it("GET /api/v2/health/ready returns 503 with the error envelope when the database is down", async () => {
    queryRaw.mockRejectedValue(new Error("connection refused"));
    const res = await request(app).get("/api/v2/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      success: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "Database is unreachable." },
    });
  });

  it("returns a NOT_FOUND envelope for unknown routes", async () => {
    const res = await request(app).get("/api/v2/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns a VALIDATION_ERROR envelope for malformed JSON", async () => {
    const res = await request(app)
      .post("/api/v2/health")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("sets secure headers", async () => {
    const res = await request(app).get("/api/v2/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

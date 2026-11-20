import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../..");

describe("production Content-Security-Policy", () => {
  const html = readFileSync(join(root, "apps/web/index.html"), "utf8");
  const headers = readFileSync(join(root, "docker/security-headers.conf"), "utf8");

  it("allows exactly the inline scripts index.html contains, by hash", () => {
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(inline.length).toBeGreaterThan(0);
    for (const script of inline) {
      const hash = createHash("sha256").update(script).digest("base64");
      expect(headers, "update the sha256 in docker/security-headers.conf").toContain(
        `'sha256-${hash}'`,
      );
    }
  });

  it("never allows inline or eval scripts wholesale", () => {
    const scriptSrc = /script-src ([^;]*);/.exec(headers)?.[1] ?? "";
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });
});

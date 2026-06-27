import { describe, expect, it, vi } from "vitest";

import {
  generateConfiguredCaddyfile,
  generateInitialCaddyfile,
  normalizeDomain,
  reloadCaddy,
  validateDomain,
  validateEmail,
} from "./caddy";

describe("caddy helpers", () => {
  it("normalizes and validates domains", () => {
    expect(normalizeDomain("https://Checks.Example.com/setup")).toBe(
      "checks.example.com",
    );
    expect(validateDomain("checks.example.com")).toBe("checks.example.com");
    expect(() => validateDomain("localhost")).toThrow("Enter a valid domain");
  });

  it("validates certificate email addresses", () => {
    expect(validateEmail("Ops@Example.com")).toBe("ops@example.com");
    expect(() => validateEmail("not-an-email")).toThrow("Enter a valid email");
  });

  it("generates initial setup Caddyfile without automatic HTTPS", () => {
    const caddyfile = generateInitialCaddyfile({
      SELFCHECKS_CADDY_ADMIN_URL: "http://caddy:2019",
      SELFCHECKS_CADDY_UPSTREAM: "selfchecks:3000",
    });

    expect(caddyfile).toContain("origins http://0.0.0.0:2019 http://caddy:2019");
    expect(caddyfile).toContain("auto_https off");
    expect(caddyfile).toContain("reverse_proxy selfchecks:3000");
  });

  it("generates configured Caddyfile with automatic HTTPS domain route", () => {
    const caddyfile = generateConfiguredCaddyfile({
      caddyEmail: "ops@example.com",
      domain: "checks.example.com",
      env: {
        SELFCHECKS_CADDY_ADMIN_URL: "http://caddy:2019",
        SELFCHECKS_CADDY_UPSTREAM: "web:3000",
      },
    });

    expect(caddyfile).toContain("origins http://0.0.0.0:2019 http://caddy:2019");
    expect(caddyfile).toContain("email ops@example.com");
    expect(caddyfile).toContain("checks.example.com {");
    expect(caddyfile).toContain('X-Frame-Options "SAMEORIGIN"');
    expect(caddyfile).not.toContain('X-Frame-Options "DENY"');
    expect(caddyfile).toContain("reverse_proxy web:3000");
    expect(caddyfile).toContain("redir https://checks.example.com{uri} 308");
  });

  it("reloads Caddy through the admin API when configured", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));

    await reloadCaddy(
      "checks.example.com { reverse_proxy web:3000 }",
      {
        SELFCHECKS_CADDY_ADMIN_URL: "http://caddy:2019",
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://caddy:2019/load",
      expect.objectContaining({
        body: "checks.example.com { reverse_proxy web:3000 }",
        headers: {
          "Content-Type": "text/caddyfile",
          Origin: "http://0.0.0.0:2019",
        },
        method: "POST",
      }),
    );
  });
});

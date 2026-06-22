import { describe, expect, it } from "vitest";

import { authOptions, authorizeAdminCredentials } from "./auth";

describe("authorizeAdminCredentials", () => {
  const env = {
    SELFCHECKS_ADMIN_LOGIN: "admin",
    SELFCHECKS_ADMIN_PASSWORD: "secret",
  };

  it("returns the admin user for matching credentials", () => {
    expect(
      authorizeAdminCredentials(
        {
          login: "admin",
          password: "secret",
        },
        env,
      ),
    ).toEqual({
      id: "admin",
      name: "admin",
    });
  });

  it("rejects invalid credentials", () => {
    expect(
      authorizeAdminCredentials(
        {
          login: "admin",
          password: "wrong",
        },
        env,
      ),
    ).toBeNull();
  });

  it("rejects credentials when admin env is not configured", () => {
    expect(
      authorizeAdminCredentials(
        {
          login: "admin",
          password: "secret",
        },
        {},
      ),
    ).toBeNull();
  });
});

describe("authOptions", () => {
  it("uses the custom login page and JWT sessions", () => {
    expect(authOptions.pages?.signIn).toBe("/login");
    expect(authOptions.session?.strategy).toBe("jwt");
  });
});

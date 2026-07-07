import { afterEach, describe, expect, it } from "vitest";

import { decryptSecretValue, encryptSecretValue } from "./secret-store";

describe("secret store", () => {
  afterEach(() => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.SELFCHECKS_SECRET_KEY;
  });

  it("encrypts and decrypts values with the configured secret key", () => {
    const env = {
      SELFCHECKS_SECRET_KEY: "unit-test-secret",
    };

    const ciphertext = encryptSecretValue("sk-live-secret", env);

    expect(ciphertext).toMatch(/^v1:/);
    expect(ciphertext).not.toContain("sk-live-secret");
    expect(decryptSecretValue(ciphertext, env)).toBe("sk-live-secret");
  });

  it("keeps legacy plaintext values readable", () => {
    expect(decryptSecretValue("legacy-token")).toBe("legacy-token");
  });

  it("rejects malformed encrypted values", () => {
    expect(() =>
      decryptSecretValue("v1:missing-parts", {
        SELFCHECKS_SECRET_KEY: "unit-test-secret",
      }),
    ).toThrow("Stored secret value is malformed.");
  });

  it("requires an explicit secret in production", () => {
    expect(() =>
      encryptSecretValue("secret", {
        NODE_ENV: "production",
      }),
    ).toThrow("NEXTAUTH_SECRET or SELFCHECKS_SECRET_KEY is required.");
  });
});

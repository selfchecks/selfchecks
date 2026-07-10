import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyApiKey: vi.fn(),
}));

vi.mock("./api-keys", () => ({
  verifyApiKey: mocks.verifyApiKey,
}));

import { isCliRequestAuthorized } from "./cli-auth";

function createRequest(token?: string) {
  return new Request("https://checks.example.test/api/cli/test-sessions", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

describe("CLI authentication", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("accepts the transitional environment token without a database lookup", async () => {
    await expect(
      isCliRequestAuthorized(createRequest("env-token"), "env-token"),
    ).resolves.toBe(true);
    expect(mocks.verifyApiKey).not.toHaveBeenCalled();
  });

  it("accepts generated API keys from the database", async () => {
    mocks.verifyApiKey.mockResolvedValue(true);

    await expect(
      isCliRequestAuthorized(createRequest("sck_generated"), "env-token"),
    ).resolves.toBe(true);
    expect(mocks.verifyApiKey).toHaveBeenCalledWith("sck_generated");
  });

  it("rejects requests without a bearer token", async () => {
    await expect(isCliRequestAuthorized(createRequest(), "env-token")).resolves.toBe(
      false,
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectFindUnique: vi.fn(),
  runtimeEnvironmentFindUnique: vi.fn(),
  secretFindMany: vi.fn(),
}));

vi.mock("@selfchecks/db", () => ({
  prisma: {
    project: {
      findUnique: mocks.projectFindUnique,
    },
    runtimeEnvironment: {
      findUnique: mocks.runtimeEnvironmentFindUnique,
    },
    secret: {
      findMany: mocks.secretFindMany,
    },
  },
}));

import { encryptSecretValue } from "../../../apps/web/lib/secret-store";
import { getRunEnvironment } from "./environment.js";

describe("getRunEnvironment", () => {
  beforeEach(() => {
    vi.stubEnv("SELFCHECKS_SECRET_KEY", "environment-test-secret");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns an empty environment when the project does not exist", async () => {
    mocks.projectFindUnique.mockResolvedValue(null);

    await expect(getRunEnvironment("missing")).resolves.toEqual([]);

    expect(mocks.runtimeEnvironmentFindUnique).not.toHaveBeenCalled();
    expect(mocks.secretFindMany).not.toHaveBeenCalled();
  });

  it("combines sorted runtime variables with decrypted secrets", async () => {
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
    });
    mocks.runtimeEnvironmentFindUnique.mockResolvedValue({
      variables: {
        BROWSER_URL: "https://example.test",
        IGNORED_NUMBER: 42,
        API_BASE_URL: "https://api.example.test",
      },
    });
    mocks.secretFindMany.mockResolvedValue([
      {
        name: "API_TOKEN",
        valueCiphertext: encryptSecretValue("secret-token", {
          SELFCHECKS_SECRET_KEY: "environment-test-secret",
        }),
      },
      {
        name: "LEGACY_TOKEN",
        valueCiphertext: "legacy-secret",
      },
    ]);

    await expect(getRunEnvironment("default")).resolves.toEqual([
      {
        name: "API_BASE_URL",
        value: "https://api.example.test",
      },
      {
        name: "BROWSER_URL",
        value: "https://example.test",
      },
      {
        name: "API_TOKEN",
        value: "secret-token",
      },
      {
        name: "LEGACY_TOKEN",
        value: "legacy-secret",
      },
    ]);
    expect(mocks.runtimeEnvironmentFindUnique).toHaveBeenCalledWith({
      where: {
        projectId_name: {
          name: "default",
          projectId: "project_1",
        },
      },
    });
    expect(mocks.secretFindMany).toHaveBeenCalledWith({
      orderBy: {
        name: "asc",
      },
      where: {
        projectId: "project_1",
      },
    });
  });

  it("rejects malformed encrypted secrets", async () => {
    mocks.projectFindUnique.mockResolvedValue({
      id: "project_1",
    });
    mocks.runtimeEnvironmentFindUnique.mockResolvedValue(null);
    mocks.secretFindMany.mockResolvedValue([
      {
        name: "BROKEN_TOKEN",
        valueCiphertext: "v1:missing-parts",
      },
    ]);

    await expect(getRunEnvironment("default")).rejects.toThrow(
      "Stored secret value is malformed.",
    );
  });
});

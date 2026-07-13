import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deploymentFindFirst: vi.fn(),
  getRunEnvironment: vi.fn(),
  queueAdd: vi.fn(),
  queueClose: vi.fn(),
  queueConstructor: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: mocks.queueConstructor.mockImplementation(() => ({
    add: mocks.queueAdd,
    close: mocks.queueClose,
  })),
}));

vi.mock("@selfchecks/cli/environment", () => ({
  getRunEnvironment: mocks.getRunEnvironment,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deployment: {
      findFirst: mocks.deploymentFindFirst,
    },
  },
}));

import { POST } from "./route";

describe("CLI trigger route", () => {
  beforeEach(() => {
    vi.stubEnv("SELFCHECKS_API_TOKEN", "api-token");
    mocks.deploymentFindFirst.mockResolvedValue({
      source: "/app/runtime/deployments/deployment_1",
    });
    mocks.getRunEnvironment.mockResolvedValue([
      { name: "API_URL", value: "https://api.example.test" },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("merges environment values and queues a trigger job", async () => {
    const response = await POST(
      new Request("http://localhost/api/cli/triggers", {
        body: JSON.stringify({
          env: [
            { name: "API_URL", value: "https://override.example.test" },
            { name: "BASE_URL", value: "https://example.test" },
          ],
          projectSlug: "account",
          ref: "stable",
          reporter: "github",
        }),
        headers: {
          Authorization: "Bearer api-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({ status: "queued" });
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "trigger-checks",
      expect.objectContaining({
        env: [
          { name: "API_URL", value: "https://override.example.test" },
          { name: "BASE_URL", value: "https://example.test" },
        ],
        kind: "trigger",
        projectSlug: "account",
        ref: "stable",
        rootDir: "/app/runtime/deployments/deployment_1",
      }),
      expect.objectContaining({ jobId: body.triggerId }),
    );
  });
});

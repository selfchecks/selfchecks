import { afterEach, describe, expect, it, vi } from "vitest";

import { runRemoteTrigger } from "./remote-trigger.js";

describe("remote trigger", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("queues a trigger and polls its result", async () => {
    const summary = {
      durationMs: 10,
      failed: 0,
      passed: 1,
      results: [],
      sessionId: "session_1",
      skipped: 0,
      total: 1,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusUrl: "/api/cli/triggers/trigger_1",
            triggerId: "trigger_1",
          }),
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "completed", summary })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runRemoteTrigger({
        apiToken: "secret",
        apiUrl: "https://checks.example.test",
        commitSha: "abc123",
        env: [{ name: "BASE_URL", value: "https://example.test" }],
        projectSlug: "account",
        ref: "stable",
        reporter: "github",
      }),
    ).resolves.toEqual(summary);

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      commitSha: "abc123",
      env: [{ name: "BASE_URL", value: "https://example.test" }],
      projectSlug: "account",
      ref: "stable",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://checks.example.test/api/cli/triggers/trigger_1",
      { headers: { Authorization: "Bearer secret" } },
    );
  });
});

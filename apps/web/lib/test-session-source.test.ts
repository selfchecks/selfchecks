import { describe, expect, it } from "vitest";

import {
  formatTestSessionSource,
  getTestSessionSourceBranch,
} from "./test-session-source";

describe("test session source", () => {
  it("formats structured metadata into display fields", () => {
    expect(
      formatTestSessionSource({
        commitSha: "eb3f7ed312345678",
        jobUrl: "https://gitlab.sndsy.ru/sendsay-ru/frontend/account/-/jobs/123",
        pipelineUrl:
          "https://gitlab.sndsy.ru/sendsay-ru/frontend/account/-/pipelines/6569",
        ref: "release/3.192.42",
        repository: "sendsay-ru/frontend/account",
      }),
    ).toEqual([
      {
        label: "Repository",
        value: "sendsay-ru/frontend/account",
      },
      {
        label: "Version",
        value: "release/3.192.42",
      },
      {
        label: "Commit",
        value: "eb3f7ed3",
      },
      {
        href: "https://gitlab.sndsy.ru/sendsay-ru/frontend/account/-/pipelines/6569",
        label: "Pipeline",
        value: "https://gitlab.sndsy.ru/sendsay-ru/frontend/account/-/pipelines/6569",
      },
      {
        href: "https://gitlab.sndsy.ru/sendsay-ru/frontend/account/-/jobs/123",
        label: "Job",
        value: "https://gitlab.sndsy.ru/sendsay-ru/frontend/account/-/jobs/123",
      },
    ]);
  });

  it("reads legacy source strings for existing sessions", () => {
    expect(
      formatTestSessionSource(
        "sendsay-ru/frontend/account | release/3.192.42 | eb3f7ed3 | pipeline https://gitlab.sndsy.ru/sendsay-ru/frontend/account/-/pipelines/6569",
      ),
    ).toEqual([
      { label: "Repository", value: "sendsay-ru/frontend/account" },
      { label: "Version", value: "release/3.192.42" },
      { label: "Commit", value: "eb3f7ed3" },
      {
        href: "https://gitlab.sndsy.ru/sendsay-ru/frontend/account/-/pipelines/6569",
        label: "Pipeline",
        value: "https://gitlab.sndsy.ru/sendsay-ru/frontend/account/-/pipelines/6569",
      },
    ]);
  });

  it("extracts branch from structured metadata", () => {
    expect(getTestSessionSourceBranch({ ref: "release/3.192.42" })).toBe(
      "release/3.192.42",
    );
  });

  it("does not infer branch from an unstructured source", () => {
    expect(getTestSessionSourceBranch("manual source")).toBeUndefined();
  });
});

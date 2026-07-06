import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { RunDetailData } from "@/lib/dashboard-data";

import { RunDetailView } from "./run-detail-view";

const detail: RunDetailData = {
  check: {
    id: "check_1",
    name: "bff-gtm-js",
    settings: {
      enabled: true,
      frequency: "180 min",
      key: "bff-gtm-js",
      request: {
        assertions: 1,
        body: false,
        headers: 1,
        method: "GET",
        url: "https://bff.sndsy.ru/gtm.js?id=GTM-MP43XM",
      },
    },
    tags: ["api", "bff"],
    type: "api",
  },
  groupName: "API / Bff",
  projectSlug: "default",
  run: {
    artifacts: [
      {
        downloadUrl: "/api/runs/run_1/artifacts/artifact_1?download=1",
        id: "artifact_1",
        mimeType: "application/zip",
        name: "trace.zip",
        size: "42 KB",
        type: "trace",
        viewUrl: "/runs/run_1/artifacts/artifact_1/trace",
      },
      {
        downloadUrl: "/api/runs/run_1/artifacts/artifact_2?download=1",
        id: "artifact_2",
        mimeType: "image/png",
        name: "screenshot.png",
        size: "256 KB",
        type: "screenshot",
        viewUrl: "/api/runs/run_1/artifacts/artifact_2",
      },
      {
        downloadUrl: "/api/runs/run_1/artifacts/artifact_3?download=1",
        id: "artifact_3",
        mimeType: "video/webm",
        name: "video.webm",
        size: "1.2 MB",
        type: "video",
        viewUrl: "/api/runs/run_1/artifacts/artifact_3",
      },
    ],
    createdAt: "2026-06-24T13:20:03.000Z",
    createdAtLabel: "Jun 24 16:20 (UTC+3)",
    duration: "2.39 s",
    durationMs: 2390,
    finishedAt: "Jun 24 16:20 (UTC+3)",
    hasRetries: false,
    id: "run_1",
    jobLog: "GET https://bff.sndsy.ru/gtm.js?id=GTM-MP43XM\n200 OK",
    occurredAt: "Jun 24 16:20 (UTC+3)",
    performance: {
      errors: {
        consoleErrors: 5,
        documentErrors: 0,
        networkErrors: 11,
        scriptErrors: 0,
      },
    },
    request: {
      assertions: [
        {
          actual: "200",
          comparison: "Equals",
          passed: true,
          source: "Status",
          target: "200",
        },
      ],
      headers: [
        {
          name: "accept",
          value: "application/json",
        },
      ],
      method: "GET",
      queryParams: [
        {
          name: "id",
          value: "GTM-MP43XM",
        },
      ],
      url: "https://bff.sndsy.ru/gtm.js?id=GTM-MP43XM",
    },
    response: {
      body: '{"ok":true}',
      headers: [
        {
          name: "content-type",
          value: "application/json",
        },
      ],
      status: "200",
      statusText: "OK",
      url: "https://bff.sndsy.ru/gtm.js?id=GTM-MP43XM",
    },
    resultFields: [
      {
        label: "Status",
        value: "200",
      },
      {
        label: "Status Text",
        value: "OK",
      },
    ],
    resultJson:
      '{\n  "body": "{\\"ok\\":true}",\n  "headers": {\n    "content-type": "application/json"\n  },\n  "status": 200,\n  "statusText": "OK"\n}',
    runner: "Local runner",
    runState: "passed",
    startedAt: "Jun 24 16:20 (UTC+3)",
    status: "passing",
  },
};

const browserDetail: RunDetailData = {
  ...detail,
  check: {
    ...detail.check,
    name: "Header search input",
    settings: {
      ...detail.check.settings,
      entrypoint: "tests/header-search.spec.ts",
      request: undefined,
    },
    type: "browser",
  },
  groupName: "App / Regress",
  run: {
    ...detail.run,
    aiAnalysis: {
      apiEndpoint: "https://openrouter.ai/api/v1",
      content: "Вероятная причина: селектор поля поиска не найден.",
      createdAt: "2026-06-24T13:21:00.000Z",
      model: "openai/gpt-5-mini",
      responseLanguage: "Russian",
      status: "completed",
    },
    request: undefined,
    response: undefined,
    resultFields: [
      {
        label: "Command",
        value: "npx playwright test tests/header-search.spec.ts",
      },
      {
        label: "Exit Code",
        value: "1",
      },
    ],
    resultJson:
      '{\n  "command": "npx playwright test tests/header-search.spec.ts",\n  "exitCode": 1\n}',
    runState: "failed",
    status: "failing",
  },
};

describe("RunDetailView", () => {
  it("renders a dedicated run detail page with request, response and artifacts", async () => {
    const user = userEvent.setup();

    render(<RunDetailView accountLabel="nikolaev@iprojects.ru" detail={detail} />);

    expect(screen.getByText("SelfChecks")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to check" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "bff-gtm-js" })).toBeTruthy();
    expect(screen.getByText("Passed at Jun 24 16:20 (UTC+3)")).toBeTruthy();
    expect(screen.getByText("Check report")).toBeTruthy();
    expect(screen.getAllByText("GET").length).toBeGreaterThan(1);
    expect(
      screen.getAllByText("https://bff.sndsy.ru/gtm.js?id=GTM-MP43XM").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Attempt #1")).toBeTruthy();
    expect(screen.getByText("0/1 failed")).toBeTruthy();
    expect(screen.getByText("Check Duration")).toBeTruthy();
    expect(screen.getByText("Console Errors")).toBeTruthy();
    expect(screen.getByText("Network Errors")).toBeTruthy();
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("11").length).toBeGreaterThan(0);
    expect(screen.getByText("Playwright test report")).toBeTruthy();
    expect(screen.getByText("Page navigations")).toBeTruthy();
    const navigationToggle = screen.getByLabelText(
      "Toggle navigation https://bff.sndsy.ru/gtm.js?id=GTM-MP43XM",
    );
    const navigationDetails = navigationToggle.closest("details") as HTMLDetailsElement;
    expect(navigationDetails.open).toBe(false);
    await user.click(navigationToggle);
    expect(navigationDetails.open).toBe(true);
    expect(screen.getAllByText("Response body").length).toBeGreaterThan(0);
    expect(screen.getByText("Assertions")).toBeTruthy();
    expect(screen.getAllByText("Status").length).toBeGreaterThan(1);
    expect(screen.getByText("Equals")).toBeTruthy();
    expect(screen.getAllByText("200").length).toBeGreaterThan(1);
    expect(screen.getByText("Request data")).toBeTruthy();
    expect(screen.getByText("Query params")).toBeTruthy();
    expect(screen.getByText("GTM-MP43XM")).toBeTruthy();
    expect(screen.getByText("Response data")).toBeTruthy();
    expect(screen.getByText("content-type")).toBeTruthy();
    expect(screen.getAllByText("application/json").length).toBeGreaterThan(1);
    expect(screen.getAllByText('{"ok":true}').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("link", { name: "Open Trace artifact trace.zip" }),
    ).toBeNull();
    expect(screen.getAllByText("trace.zip").length).toBe(1);
    expect(screen.getAllByText("Trace · 42 KB").length).toBe(1);
    expect(screen.getAllByText("screenshot.png").length).toBe(1);
    expect(screen.getAllByText("Screenshot · 256 KB").length).toBe(1);
    expect(screen.getAllByText("video.webm").length).toBe(1);
    expect(screen.getAllByText("Video · 1.2 MB").length).toBe(1);
    expect(
      (screen.getByRole("link", { name: "View trace.zip" }) as HTMLAnchorElement).href,
    ).toContain("/runs/run_1/artifacts/artifact_1/trace");
    expect(
      (screen.getByRole("link", { name: "View screenshot.png" }) as HTMLAnchorElement)
        .href,
    ).toContain("/api/runs/run_1/artifacts/artifact_2");
    expect(
      (screen.getByRole("link", { name: "View video.webm" }) as HTMLAnchorElement).href,
    ).toContain("/api/runs/run_1/artifacts/artifact_3");
    expect(
      (screen.getByRole("link", { name: "Download trace.zip" }) as HTMLAnchorElement)
        .href,
    ).toContain("/api/runs/run_1/artifacts/artifact_1?download=1");
    expect(screen.getByText("Job log")).toBeTruthy();
    expect(screen.getAllByText(/200 OK/).length).toBeGreaterThan(1);
  });

  it("hides empty API-only blocks for browser runs", () => {
    render(
      <RunDetailView accountLabel="nikolaev@iprojects.ru" detail={browserDetail} />,
    );

    expect(screen.getByRole("heading", { name: "Header search input" })).toBeTruthy();
    expect(screen.getByText("Playwright test report")).toBeTruthy();
    expect(screen.queryByText("Assertions")).toBeNull();
    expect(screen.queryByText("No assertions recorded for this run.")).toBeNull();
    expect(screen.queryByText("Request data")).toBeNull();
    expect(screen.queryByText("No request data recorded for this run.")).toBeNull();
    expect(screen.getByText("AI analysis")).toBeTruthy();
    expect(
      screen.getByText("Вероятная причина: селектор поля поиска не найден."),
    ).toBeTruthy();
    expect(screen.queryByText("Result data")).toBeNull();
    expect(screen.getByText("trace.zip")).toBeTruthy();
  });

  it("keeps result data for browser runs without AI analysis", () => {
    render(
      <RunDetailView
        accountLabel="nikolaev@iprojects.ru"
        detail={{
          ...browserDetail,
          run: {
            ...browserDetail.run,
            aiAnalysis: undefined,
          },
        }}
      />,
    );

    expect(screen.queryByText("AI analysis")).toBeNull();
    expect(screen.getByText("Result data")).toBeTruthy();
    expect(
      screen.getAllByText("npx playwright test tests/header-search.spec.ts").length,
    ).toBeGreaterThan(1);
  });

  it("renders an overlay comparison slider for visual screenshot mismatches", () => {
    render(
      <RunDetailView
        accountLabel="nikolaev@iprojects.ru"
        detail={{
          ...browserDetail,
          run: {
            ...browserDetail.run,
            artifacts: [
              {
                downloadUrl: "/api/runs/run_1/artifacts/expected?download=1",
                id: "expected",
                mimeType: "image/png",
                name: "home-page-expected.png",
                size: "250 KB",
                type: "screenshot",
                viewUrl: "/api/runs/run_1/artifacts/expected",
              },
              {
                downloadUrl: "/api/runs/run_1/artifacts/actual?download=1",
                id: "actual",
                mimeType: "image/png",
                name: "home-page-actual.png",
                size: "251 KB",
                type: "screenshot",
                viewUrl: "/api/runs/run_1/artifacts/actual",
              },
              {
                downloadUrl: "/api/runs/run_1/artifacts/diff?download=1",
                id: "diff",
                mimeType: "image/png",
                name: "home-page-diff.png",
                size: "18 KB",
                type: "screenshot",
                viewUrl: "/api/runs/run_1/artifacts/diff",
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText("Screenshot comparisons")).toBeTruthy();
    expect(screen.getByText("1 visual mismatch")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "home page" })).toBeTruthy();
    expect(
      (screen.getByRole("link", { name: "Diff" }) as HTMLAnchorElement).href,
    ).toContain("/api/runs/run_1/artifacts/diff");

    const slider = screen.getByRole("slider", {
      name: "Reveal actual screenshot for home page",
    });
    const actualImage = screen.getByAltText(
      "Actual screenshot for home page",
    ) as HTMLImageElement;

    expect(actualImage.style.clipPath).toBe("inset(0 50% 0 0)");
    fireEvent.change(slider, { target: { value: "75" } });
    expect(actualImage.style.clipPath).toBe("inset(0 25% 0 0)");
  });
});

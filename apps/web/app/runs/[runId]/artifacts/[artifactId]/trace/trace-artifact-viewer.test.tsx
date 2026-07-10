import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  routerBack: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: mocks.routerBack,
    push: mocks.routerPush,
  }),
}));

import TraceArtifactPage from "./page";
import { TraceArtifactViewer } from "./trace-artifact-viewer";

describe("TraceArtifactViewer", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("builds a Playwright trace viewer URL and download link", async () => {
    render(
      <TraceArtifactViewer
        accountLabel="admin@example.com"
        artifactUrl="/api/runs/run_1/artifacts/artifact_1"
        downloadUrl="/api/runs/run_1/artifacts/artifact_1?download=1"
        runId="run_1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTitle("Playwright trace viewer")).toBeTruthy();
    });

    const viewer = screen.getByTitle("Playwright trace viewer") as HTMLIFrameElement;
    const openLink = screen.getByRole("link", {
      name: "Open trace viewer in new tab",
    }) as HTMLAnchorElement;
    const downloadLink = screen.getByRole("link", {
      name: "Download trace",
    }) as HTMLAnchorElement;

    expect(viewer.src).toBe(openLink.href);
    expect(openLink.href).toContain("/trace-viewer/index.html?trace=");
    expect(openLink.href).toContain(
      encodeURIComponent("http://localhost:3000/api/runs/run_1/artifacts/artifact_1"),
    );
    expect(downloadLink.getAttribute("href")).toBe(
      "/api/runs/run_1/artifacts/artifact_1?download=1",
    );
  });
});

describe("TraceArtifactPage", () => {
  it("passes encoded run and artifact URLs to the viewer", async () => {
    render(
      await TraceArtifactPage({
        params: Promise.resolve({
          artifactId: "artifact / 1",
          runId: "run / 1",
        }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByTitle("Playwright trace viewer")).toBeTruthy();
    });

    const downloadLink = screen.getByRole("link", {
      name: "Download trace",
    }) as HTMLAnchorElement;

    expect(downloadLink.getAttribute("href")).toBe(
      "/api/runs/run%20%2F%201/artifacts/artifact%20%2F%201?download=1",
    );
    expect(screen.getByText("Run run / 1")).toBeTruthy();
  });
});

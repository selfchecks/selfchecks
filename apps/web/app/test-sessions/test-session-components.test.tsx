import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ArtifactSummary,
  RunStateBadge,
  SummaryPills,
} from "./test-session-components";

describe("test session components", () => {
  it("renders run state badges with human-readable labels", () => {
    render(<RunStateBadge runState="timed_out" status="failing" />);

    const badge = screen.getByText("Timed out");

    expect(badge.className).toContain("whitespace-nowrap");
    expect(badge.className).toContain("shrink-0");
  });

  it("renders failed regressions with a distinct label", () => {
    render(<RunStateBadge isRegress runState="failed" status="failing" />);

    expect(screen.getByText("Regress").className).toContain("text-red-300");
    expect(screen.queryByText("Failed")).toBeNull();
  });

  it("renders summary counters", () => {
    render(
      <SummaryPills
        summary={{
          failed: 1,
          passed: 2,
          queued: 3,
          regress: 1,
          running: 4,
          total: 10,
        }}
      />,
    );

    expect(screen.getByText("Total")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("Passed")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getAllByText("1")).toHaveLength(2);
    expect(screen.getByText("Regress")).toBeTruthy();
  });

  it("summarizes artifacts and hides overflow behind a counter", () => {
    render(
      <ArtifactSummary
        artifacts={[
          createArtifact("artifact_1", "trace"),
          createArtifact("artifact_2", "screenshot"),
          createArtifact("artifact_3", "video"),
          createArtifact("artifact_4", "log"),
          createArtifact("artifact_5", "json"),
          createArtifact("artifact_6", "request_response"),
        ]}
      />,
    );

    expect(screen.getByTitle("artifact_1.zip (1 KB)")).toBeTruthy();
    expect(screen.getByText("trace")).toBeTruthy();
    expect(screen.getByText("+1")).toBeTruthy();
    expect(screen.queryByText("request_response")).toBeNull();
  });

  it("renders an empty artifact placeholder", () => {
    render(<ArtifactSummary artifacts={[]} />);

    expect(screen.getByText("-")).toBeTruthy();
  });
});

function createArtifact(
  id: string,
  type: "json" | "log" | "request_response" | "screenshot" | "trace" | "video",
) {
  return {
    downloadUrl: `/api/artifacts/${id}?download=1`,
    id,
    mimeType: "application/octet-stream",
    name: `${id}.zip`,
    size: "1 KB",
    type,
    viewUrl: `/api/artifacts/${id}`,
  };
}

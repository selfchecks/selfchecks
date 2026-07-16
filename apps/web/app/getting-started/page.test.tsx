import { render, screen } from "@testing-library/react";
import { parseCheckManifestSource } from "@selfchecks/core";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { apiManifest, checklyConfig, githubActions, gitlabCi } from "./examples";
import GettingStartedPage from "./page";

describe("GettingStartedPage", () => {
  it("documents the complete first-project flow for public visitors", () => {
    render(<GettingStartedPage />);

    expect(
      screen.getByRole("heading", { name: "Create your first SelfChecks project" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open dashboard" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Add configuration" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Choose the right API testing style" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Modules you can use in tests" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Deploy your own server" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Use the HTTP API directly" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Set up GitLab CI/CD" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Set up GitHub Actions" })).toBeTruthy();
    expect(screen.getByText("/api/cli/triggers")).toBeTruthy();
    expect(screen.getByText(".gitlab-ci.yml")).toBeTruthy();
    expect(screen.getByText(".github/workflows/selfchecks.yml")).toBeTruthy();
    expect(screen.getByText(/npm install --omit=dev/)).toBeTruthy();
    expect(screen.getByText(/AssertionBuilder data/)).toBeTruthy();
  });

  it("keeps the published TypeScript examples syntactically valid", () => {
    for (const source of [checklyConfig, apiManifest]) {
      const result = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext },
        reportDiagnostics: true,
      });

      expect(result.diagnostics ?? []).toEqual([]);
    }

    expect(
      parseCheckManifestSource(apiManifest, "checks/health.check.ts"),
    ).toMatchObject({
      checks: [{ key: "api-health", name: "API health", type: "api" }],
      warnings: [],
    });
  });

  it("publishes safe, portable CI examples", () => {
    expect(gitlabCi).toContain('needs: ["selfchecks:test"]');
    expect(gitlabCi).toContain("--reporter list");
    expect(githubActions).toContain("branches: [main]");
    expect(githubActions).toContain("refs/heads/main");

    for (const workflow of [gitlabCi, githubActions]) {
      expect(workflow).toContain("ghcr.io/selfchecks/selfchecks-cli:stable");
      expect(workflow).not.toContain("selfchecks-web");
    }
  });
});

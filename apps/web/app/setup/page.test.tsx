import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SetupPage from "./page";

describe("SetupPage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders first-launch setup form", async () => {
    render(await SetupPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Configure SelfChecks" })).toBeTruthy();
    expect(screen.getByLabelText("Login")).toBeTruthy();
    expect(screen.getByLabelText("Domain")).toBeTruthy();
    expect(screen.getByLabelText("Certificate email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Finish setup" })).toBeTruthy();
  });

  it("renders setup token field when token is configured", async () => {
    vi.stubEnv("SELFCHECKS_SETUP_TOKEN", "setup-token");

    render(await SetupPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByLabelText("Setup token")).toBeTruthy();
  });
});

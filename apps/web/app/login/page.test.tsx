import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LoginPage from "./page";

vi.mock("@/components/auth/login-form", () => ({
  LoginForm: () => <form aria-label="login form" />,
}));

describe("LoginPage", () => {
  it("renders the sign-in shell", () => {
    render(<LoginPage />);

    expect(screen.getByText("SelfChecks")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("form", { name: "login form" })).toBeTruthy();
  });
});

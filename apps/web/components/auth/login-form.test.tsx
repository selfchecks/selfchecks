import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

const push = vi.fn();
const refresh = vi.fn();
const signIn = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
  useSearchParams: () => new URLSearchParams("callbackUrl=/checks"),
}));

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
    signIn.mockReset();
  });

  it("submits credentials and redirects on success", async () => {
    signIn.mockResolvedValue({
      ok: true,
    });

    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText("Login"), "admin");
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(signIn).toHaveBeenCalledWith("credentials", {
      callbackUrl: "/checks",
      login: "admin",
      password: "secret",
      redirect: false,
    });
    expect(push).toHaveBeenCalledWith("/checks");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows an error when credentials are rejected", async () => {
    signIn.mockResolvedValue({
      ok: false,
    });

    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText("Login"), "admin");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid login or password.")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});

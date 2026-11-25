import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConsentView } from "./consent-view";

function renderConsent(requestedScopes: string[]) {
  return render(
    <ConsentView
      requestId="pending"
      csrf="test-csrf"
      clientName="Test client"
      redirectOrigin="https://client.example"
      requestedScopes={requestedScopes}
      projects={[{ slug: "shop", name: "Shop" }]}
    />,
  );
}

describe("ConsentView permissions", () => {
  it("lists all permissions for a read-only request and identifies session access", () => {
    renderConsent(["read"]);

    const permissions = within(screen.getByRole("group", { name: "Permissions" }));
    expect(permissions.getAllByRole("listitem")).toHaveLength(3);
    expect(permissions.getByText("Required")).toBeTruthy();
    expect(permissions.getByText(/test sessions and their runs/)).toBeTruthy();
    expect(permissions.getAllByText("Not requested")).toHaveLength(2);
    for (const input of permissions.getAllByRole<HTMLInputElement>("checkbox")) {
      expect(input.disabled).toBe(true);
      expect(new FormData(input.form!).has(input.name)).toBe(false);
    }
  });

  it.each([
    ["run", "Run checks manually"],
    ["deploy", "Record application releases"],
  ])(
    "submits the optional %s permission only after an explicit selection",
    (scope, label) => {
      renderConsent(["read", scope]);

      const input = screen.getByRole<HTMLInputElement>("checkbox", { name: label });
      const form = input.form!;
      expect(input.disabled).toBe(false);
      expect(input.checked).toBe(false);
      expect(new FormData(form).has(scope)).toBe(false);
      fireEvent.click(input);
      expect(new FormData(form).get(scope)).toBe("yes");
    },
  );
});

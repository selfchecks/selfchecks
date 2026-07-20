import { render, screen } from "@testing-library/react";
import { History } from "lucide-react";
import { describe, expect, it } from "vitest";

import { TablePageSkeleton } from "./table-page-skeleton";

describe("TablePageSkeleton", () => {
  it("renders an accessible page shell and table placeholder", () => {
    render(
      <TablePageSkeleton
        activeItem="journal"
        ariaLabel="Loading journal"
        columns={["Run", "Status"]}
        filters={2}
        icon={History}
        title="Journal"
      />,
    );

    expect(screen.getByLabelText("Loading journal")).toBeTruthy();
    expect(screen.getByLabelText("Loading journal content")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Journal" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Run" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeTruthy();
  });
});

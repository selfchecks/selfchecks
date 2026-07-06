import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JournalData } from "@/lib/dashboard-data";

import { JournalFilters } from "./journal-filters";

const filters: JournalData["filters"] = {
  page: 1,
  pageSize: 20,
  query: "",
  range: "7d",
  status: "all",
  type: "all",
};

describe("JournalFilters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits select filters on change and search on Enter", async () => {
    const user = userEvent.setup();
    const requestSubmit = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => undefined);

    render(<JournalFilters filters={filters} />);

    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Reset" })).toBeNull();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Status" }),
      "failed",
    );
    expect(requestSubmit).toHaveBeenCalledTimes(1);

    await user.type(screen.getByRole("searchbox", { name: "Search runs" }), "health");
    expect(requestSubmit).toHaveBeenCalledTimes(1);

    await user.keyboard("{Enter}");
    expect(requestSubmit).toHaveBeenCalledTimes(2);
  });
});

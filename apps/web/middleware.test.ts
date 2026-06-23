import { describe, expect, it } from "vitest";

import { config } from "./middleware";

describe("middleware config", () => {
  it("protects application routes and leaves auth/static routes public", () => {
    expect(config.matcher).toEqual([
      "/((?!api/auth|api/setup|setup|login|_next/static|_next/image|favicon.ico).*)",
    ]);
  });
});

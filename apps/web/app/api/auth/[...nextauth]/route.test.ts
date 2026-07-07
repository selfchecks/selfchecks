import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handler = vi.fn();

  return {
    authOptions: {
      providers: [],
    },
    handler,
    nextAuth: vi.fn(() => handler),
  };
});

vi.mock("next-auth", () => ({
  default: mocks.nextAuth,
}));

vi.mock("@/lib/auth", () => ({
  authOptions: mocks.authOptions,
}));

import { GET, POST } from "./route";

describe("NextAuth route", () => {
  it("exports the shared NextAuth handler for GET and POST", () => {
    expect(mocks.nextAuth).toHaveBeenCalledWith(mocks.authOptions);
    expect(GET).toBe(mocks.handler);
    expect(POST).toBe(mocks.handler);
  });
});

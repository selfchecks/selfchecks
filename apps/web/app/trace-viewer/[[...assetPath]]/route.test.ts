import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

function createContext(assetPath?: string[]) {
  return {
    params: Promise.resolve({
      assetPath,
    }),
  };
}

describe("trace viewer proxy route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("proxies the trace viewer document", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<!doctype html>", {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request(
        "http://localhost/trace-viewer/index.html?trace=http%3A%2F%2Flocalhost",
      ),
      createContext(["index.html"]),
    );

    await expect(response.text()).resolves.toBe("<!doctype html>");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://trace.playwright.dev/index.html?trace=http%3A%2F%2Flocalhost"),
      expect.any(Object),
    );
  });

  it("proxies trace viewer assets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("console.log('viewer')", {
        headers: {
          "content-type": "text/javascript",
        },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/trace-viewer/assets/viewer.js"),
      createContext(["assets", "viewer.js"]),
    );

    await expect(response.text()).resolves.toBe("console.log('viewer')");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(response.headers.get("content-type")).toBe("text/javascript");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://trace.playwright.dev/assets/viewer.js"),
      expect.any(Object),
    );
  });
});

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

  it.each([
    [undefined, "index.html", "private, no-store"],
    [[], "index.html", "private, no-store"],
    [["snapshot.html"], "snapshot.html", "public, max-age=3600"],
    [["sw.bundle.js"], "sw.bundle.js", "public, max-age=3600"],
    [["manifest.webmanifest"], "manifest.webmanifest", "public, max-age=3600"],
    [["playwright-logo.svg"], "playwright-logo.svg", "public, max-age=3600"],
    [["index.B5WWZ7O0.js"], "index.B5WWZ7O0.js", "public, max-age=3600"],
    [["codicon.DCmgc-ay.ttf"], "codicon.DCmgc-ay.ttf", "public, max-age=3600"],
    [
      ["defaultSettingsView.C8BeHuxd.css"],
      "defaultSettingsView.C8BeHuxd.css",
      "public, max-age=3600",
    ],
    [
      ["assets", "fonts", "codicon.woff2"],
      "assets/fonts/codicon.woff2",
      "public, max-age=3600",
    ],
  ] as const)("preserves viewer resource %s", async (segments, path, cache) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("viewer resource"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/trace-viewer"),
      createContext(segments ? [...segments] : undefined),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(cache);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      new URL(`https://trace.playwright.dev/${path}`),
      { headers: { Accept: "*/*" }, redirect: "manual" },
    );
  });

  it.each([
    ["https://untrusted.example/viewer.js"],
    ["http://untrusted.example/viewer.js"],
    ["//untrusted.example/viewer.js"],
    ["\\\\untrusted.example\\viewer.js"],
    ["https:", "", "untrusted.example", "viewer.js"],
    ["\t//untrusted.example/viewer.js"],
    ["\n//untrusted.example/viewer.js"],
    ["data:text/html,test"],
    ["file:", "viewer.js"],
    ["assets", "..", "index.html"],
    ["assets", ".", "viewer.js"],
    ["assets", "%2e%2e", "index.html"],
    ["assets", "%252e%252e", "index.html"],
    ["assets", "..%2findex.html"],
    ["assets", "nested/viewer.js"],
    ["assets", "nested\\viewer.js"],
    ["assets", "viewer.js?target=other"],
    ["assets", "viewer.js#fragment"],
    ["assets", ""],
    [""],
    ["other.html"],
    ["api", "viewer.js"],
    ["contexts"],
    ["snapshot", "resource"],
    ["assets", "private.txt"],
  ])("rejects untrusted resource %j before fetch", async (...segments) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("untrusted"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/trace-viewer/index.html"),
      createContext(segments),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([301, 302, 303, 307, 308])(
    "does not follow or expose an upstream %s redirect",
    async (status) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(null, {
          status,
          headers: { Location: "https://untrusted.example/viewer.js" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await GET(
        new Request("http://localhost/trace-viewer/assets/viewer.js"),
        createContext(["assets", "viewer.js"]),
      );

      expect(response.status).toBe(502);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        new URL("https://trace.playwright.dev/assets/viewer.js"),
        { headers: { Accept: "*/*" }, redirect: "manual" },
      );
    },
  );
});

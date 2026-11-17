import { describe, expect, it } from "vitest";
import { MAX_API_RESPONSE_BYTES, readBoundedApiResponse } from "./runner.js";

describe("bounded API response capture", () => {
  it("preserves ordinary UTF-8 response bodies", async () => {
    expect(
      await readBoundedApiResponse(
        new Response("Привет"),
        new AbortController().signal,
      ),
    ).toBe("Привет");
  });
  it("matches Response.text UTF-8 BOM handling", async () => {
    const body = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
    expect(
      await readBoundedApiResponse(new Response(body), new AbortController().signal),
    ).toBe(await new Response(body).text());
  });
  it("rejects oversized bodies instead of asserting on truncated content", async () => {
    await expect(
      readBoundedApiResponse(
        new Response(new Uint8Array(MAX_API_RESPONSE_BYTES + 1)),
        new AbortController().signal,
      ),
    ).rejects.toThrow("exceeds");
  });
  it("cancels a stalled response after headers", async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    );
    const controller = new AbortController();
    const promise = readBoundedApiResponse(response, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow("aborted");
    expect(cancelled).toBe(true);
  });
});

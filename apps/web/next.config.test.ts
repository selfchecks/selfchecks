// @vitest-environment node
import {
  getRedirectUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import nextConfig from "./next.config.mjs";

describe("legacy run URLs", () => {
  it.each(["App-%2F-Registration-%2F-Welcome-name", "check_1"])(
    "opens a stored run independently of the check path %s",
    async (checkPath) => {
      const response = await unstable_getResponseFromNextConfig({
        nextConfig,
        url: `https://checks.example.test/checks/${checkPath}/runs/failed_run`,
      });

      expect(response.status).toBe(307);
      expect(getRedirectUrl(response)).toBe(
        "https://checks.example.test/runs/failed_run",
      );
    },
  );
});

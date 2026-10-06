// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
const mocks = vi.hoisted(() => ({
  checkFindFirst: vi.fn(),
  checkFindMany: vi.fn(),
  runFindFirst: vi.fn(),
  runFindUnique: vi.fn(),
  runFindMany: vi.fn(),
  artifactFindFirst: vi.fn(),
  queryRaw: vi.fn(),
  realpath: vi.fn(),
  open: vi.fn(),
}));
vi.mock("./prisma", () => ({
  prisma: {
    check: { findFirst: mocks.checkFindFirst, findMany: mocks.checkFindMany },
    checkRun: {
      findFirst: mocks.runFindFirst,
      findUnique: mocks.runFindUnique,
      findMany: mocks.runFindMany,
    },
    artifact: { findFirst: mocks.artifactFindFirst },
    $queryRaw: mocks.queryRaw,
  },
}));
vi.mock("node:fs/promises", () => ({ realpath: mocks.realpath, open: mocks.open }));
import {
  findCheck,
  findRun,
  listChecks,
  logs,
  metrics,
  projectWhere,
  readArtifactFile,
  trace,
} from "./mcp-data";
const access = { scopes: ["read"], projectSlugs: ["shop"] };
function file(bytes: Uint8Array) {
  const close = vi.fn();
  mocks.open.mockResolvedValue({
    stat: async () => ({ isFile: () => true, size: bytes.length }),
    read: async (buffer: Buffer, _start: number, length: number, offset: number) => {
      const selected = bytes.subarray(offset, offset + length);
      buffer.set(selected);
      return { bytesRead: selected.length };
    },
    close,
  });
  return close;
}
describe("MCP data access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.realpath.mockImplementation(async (value) => value);
    mocks.runFindFirst.mockResolvedValue({ id: "run" });
  });
  it("applies project scope to run lookup and rejects other project/check keys", async () => {
    expect(() => projectWhere(access, "other")).toThrow("access denied");
    await findRun(access, "run");
    expect(mocks.runFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run", project: { slug: { in: ["shop"] } } },
      }),
    );
    mocks.runFindFirst.mockResolvedValue(null);
    await expect(findRun(access, "other-run")).rejects.toThrow("not accessible");
    mocks.checkFindFirst.mockResolvedValue({ id: "check", key: "checkout" });
    await expect(findCheck(access, "checkout")).rejects.toThrow("Provide project");
    await expect(findCheck(access, "checkout", "shop")).resolves.toMatchObject({
      id: "check",
    });
  });
  it("filters failed checks by the latest run before applying pagination", async () => {
    mocks.queryRaw.mockResolvedValue([{ id: "failed" }]);
    mocks.checkFindMany.mockResolvedValue([{ id: "failed" }]);
    await listChecks(access, { limit: 5, offset: 10 }, true);
    const query = mocks.queryRaw.mock.calls[0]?.[0];
    expect(query.sql).toContain('ORDER BY "createdAt" DESC, id DESC LIMIT 1');
    expect(query.values).toContain("shop");
    expect(query.values).toContain(10);
    expect(mocks.checkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { project: { slug: { in: ["shop"] } }, id: { in: ["failed"] } },
        skip: 0,
      }),
    );
  });
  it("rejects artifacts outside the configured storage root, including symlinks", async () => {
    mocks.realpath
      .mockResolvedValueOnce("/artifacts")
      .mockResolvedValueOnce("/private/secret");
    await expect(readArtifactFile("/artifacts/link", 100)).rejects.toThrow("outside");
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("redacts a whole log before slicing and paginates beyond 16000 characters", async () => {
    mocks.runFindUnique.mockResolvedValue({ logsPath: "/artifacts/log" });
    mocks.realpath
      .mockResolvedValueOnce("/artifacts")
      .mockResolvedValueOnce("/artifacts/log");
    const close = file(
      strToU8("a".repeat(18_000) + "\nAuthorization: Bearer hidden\nend"),
    );
    const result = await logs(access, { runId: "run", offset: 17_990, limit: 100 });
    expect(result.text).toContain("[REDACTED]");
    expect(result.text).not.toContain("hidden");
    expect(result.nextOffset).toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });
  it("reads trace events without returning snapshots or authorization headers", async () => {
    mocks.artifactFindFirst.mockResolvedValue({
      id: "trace",
      path: "/artifacts/trace.zip",
    });
    mocks.realpath
      .mockResolvedValueOnce("/artifacts")
      .mockResolvedValueOnce("/artifacts/trace.zip");
    file(
      zipSync({
        "test.trace": strToU8(
          '{"type":"before","apiName":"locator.click"}\n{"type":"after","error":{"message":"Timeout"}}\n{"type":"frame-snapshot","html":"hidden"}\n',
        ),
        "test.network": strToU8(
          '{"type":"resource-snapshot","headers":[{"name":"Authorization","value":"secret"}]}\n',
        ),
      }),
    );
    const result = await trace(access, { runId: "run", limit: 10 });
    expect(result).toMatchObject({ eventCount: 3, truncated: false });
    expect(JSON.stringify(result)).not.toMatch(/secret|hidden/);
    expect(JSON.stringify(result)).toContain("locator.click");
  });
  it("requires a valid explicit metrics window and reports the sample cap", async () => {
    await expect(
      metrics(access, {
        checkId: "check",
        from: "2026-10-06T00:00:00Z",
        to: "2026-10-05T00:00:00Z",
      }),
    ).rejects.toThrow("earlier");
    mocks.checkFindFirst.mockResolvedValue({ id: "check" });
    mocks.runFindMany.mockResolvedValue(
      Array.from({ length: 5001 }, () => ({
        status: "PASSED",
        durationMs: 300,
        result: { responseTimeMs: 100 },
      })),
    );
    const result = await metrics(access, {
      checkId: "check",
      from: "2026-10-05T00:00:00Z",
      to: "2026-10-06T00:00:00Z",
    });
    expect(result).toMatchObject({
      truncated: true,
      completedRuns: 5000,
      apiResponseTimeMs: { p95: 100 },
    });
  });
});

import { AsyncLocalStorage } from "node:async_hooks";

type MemoryDebugContext = { jobId?: string; runId?: string };
type MemoryDebugFields = Record<string, string | number | boolean | undefined>;

// Store identifiers only: never retain jobs, results, buffers or credentials.
const context = new AsyncLocalStorage<MemoryDebugContext>();

export function isMemoryDebugEnabled(): boolean {
  return process.env.SELFCHECKS_MEMORY_DEBUG === "1";
}

export function withMemoryDebugContext<T>(
  identifiers: MemoryDebugContext,
  operation: () => T,
): T {
  return isMemoryDebugEnabled()
    ? context.run({ ...context.getStore(), ...identifiers }, operation)
    : operation();
}

export function logMemoryDebug(event: string, fields: MemoryDebugFields = {}): void {
  if (!isMemoryDebugEnabled()) return;

  // Diagnostics must not turn a successful operation into a failure.
  try {
    const memory = process.memoryUsage();
    const mb = (bytes: number) => Math.round((bytes / 1_000_000) * 100) / 100;
    console.log(
      `[memory-debug] ${JSON.stringify({
        timestamp: new Date().toISOString(),
        pid: process.pid,
        event,
        ...context.getStore(),
        ...fields,
        unit: "MB",
        rss: mb(memory.rss),
        heapUsed: mb(memory.heapUsed),
        heapTotal: mb(memory.heapTotal),
        external: mb(memory.external),
        arrayBuffers: mb(memory.arrayBuffers),
      })}`,
    );
  } catch {
    // Best-effort temporary instrumentation.
  }
}

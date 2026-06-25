import { createHmac, timingSafeEqual } from "node:crypto";

const TRACE_ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;

export function createTraceAccessToken(
  runId: string,
  artifactId: string,
  now = Date.now(),
): string {
  const expiresAt = now + TRACE_ACCESS_TOKEN_TTL_MS;
  const signature = signTraceAccessToken(runId, artifactId, expiresAt);

  return `${expiresAt}.${signature}`;
}

export function verifyTraceAccessToken(
  runId: string,
  artifactId: string,
  token: string | null,
  now = Date.now(),
): boolean {
  if (!token) {
    return false;
  }

  const [expiresAtText, signature, extra] = token.split(".");

  if (!expiresAtText || !signature || extra !== undefined) {
    return false;
  }

  const expiresAt = Number.parseInt(expiresAtText, 10);

  if (!Number.isSafeInteger(expiresAt) || expiresAt < now) {
    return false;
  }

  let expectedSignature: string;

  try {
    expectedSignature = signTraceAccessToken(runId, artifactId, expiresAt);
  } catch {
    return false;
  }

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  return (
    signatureBuffer.length === expectedBuffer.length &&
    timingSafeEqual(signatureBuffer, expectedBuffer)
  );
}

function signTraceAccessToken(
  runId: string,
  artifactId: string,
  expiresAt: number,
): string {
  return createHmac("sha256", getTraceAccessSecret())
    .update(`${runId}:${artifactId}:${expiresAt}`)
    .digest("base64url");
}

function getTraceAccessSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required to open trace artifacts.");
  }

  return secret;
}

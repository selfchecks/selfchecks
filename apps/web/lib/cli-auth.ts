import crypto from "node:crypto";

import { verifyApiKey } from "./api-keys";

export async function isCliRequestAuthorized(
  request: Request,
  expectedToken = process.env.SELFCHECKS_API_TOKEN,
): Promise<boolean> {
  const authorization = request.headers.get("authorization");
  const candidate = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!candidate) {
    return false;
  }

  if (expectedToken) {
    const actual = Buffer.from(candidate);
    const expected = Buffer.from(expectedToken);

    if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) {
      return true;
    }
  }

  return verifyApiKey(candidate);
}

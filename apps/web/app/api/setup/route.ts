import fs from "node:fs";
import path from "node:path";

import { hasAdminEnvCredentials } from "@/lib/auth";
import { getRuntimeConfigPath } from "@/lib/runtime-config";
import { NextResponse } from "next/server";

import {
  generateConfiguredCaddyfile,
  reloadCaddy,
  validateDomain,
  validateEmail,
  writeCaddyfile,
} from "@/lib/caddy";
import {
  DEFAULT_TIME_ZONE,
  hashAdminPassword,
  isRuntimeAdminConfigured,
  type SelfchecksRuntimeConfig,
  writeRuntimeConfig,
} from "@/lib/runtime-config";

export const runtime = "nodejs";

function readRequiredString(formData: FormData, name: string) {
  const value = formData.get(name);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function assertSetupToken(formData: FormData) {
  const expectedToken = process.env.SELFCHECKS_SETUP_TOKEN;

  if (!expectedToken) {
    throw new Error("Setup token is not configured.");
  }

  if (formData.get("setupToken") !== expectedToken) {
    throw new Error("Invalid setup token.");
  }
}

function redirectWithError(request: Request, error: unknown) {
  const message = error instanceof Error ? error.message : "Setup failed.";
  const url = new URL("/setup", request.url);
  url.searchParams.set("error", message);

  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  let lockPath: string | undefined;
  try {
    if (isRuntimeAdminConfigured() || hasAdminEnvCredentials()) {
      return NextResponse.redirect(new URL("/login", request.url), 303);
    }

    const formData = await request.formData();
    assertSetupToken(formData);

    const login = readRequiredString(formData, "login");
    const password = readRequiredString(formData, "password");
    const passwordConfirm = readRequiredString(formData, "passwordConfirm");
    const domain = validateDomain(readRequiredString(formData, "domain"));
    const caddyEmail = validateEmail(readRequiredString(formData, "caddyEmail"));

    if (login.length < 3) {
      throw new Error("Login must be at least 3 characters.");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    if (password !== passwordConfirm) {
      throw new Error("Password confirmation does not match.");
    }

    const configPath = getRuntimeConfigPath();
    if (!configPath) throw new Error("Runtime config path is not configured.");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const candidateLockPath = `${configPath}.setup.lock`;
    fs.closeSync(fs.openSync(candidateLockPath, "wx", 0o600));
    lockPath = candidateLockPath;
    if (isRuntimeAdminConfigured() || hasAdminEnvCredentials()) {
      return NextResponse.redirect(new URL("/login", request.url), 303);
    }

    const now = new Date().toISOString();
    const caddyfile = generateConfiguredCaddyfile({ caddyEmail, domain });
    const passwordHash = hashAdminPassword(password);
    const runtimeConfig: SelfchecksRuntimeConfig = {
      admin: {
        configuredAt: now,
        login,
        ...passwordHash,
      },
      preferences: {
        timeZone: DEFAULT_TIME_ZONE,
      },
      server: {
        caddyEmail,
        domain,
        publicUrl: `https://${domain}`,
      },
      setup: {
        completedAt: now,
      },
    };

    writeCaddyfile(caddyfile);
    await reloadCaddy(caddyfile);
    writeRuntimeConfig(runtimeConfig);

    return NextResponse.redirect(
      new URL("/login?setup=complete", runtimeConfig.server.publicUrl),
      303,
    );
  } catch (error) {
    return redirectWithError(request, error);
  } finally {
    if (lockPath) fs.unlinkSync(lockPath);
  }
}

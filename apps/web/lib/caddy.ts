import fs from "node:fs";
import path from "node:path";

export type CaddyEnv = {
  [key: string]: string | undefined;
  SELFCHECKS_CADDY_ADMIN_URL?: string;
  SELFCHECKS_CADDY_ADMIN_ORIGIN?: string;
  SELFCHECKS_CADDY_CONFIG_PATH?: string;
  SELFCHECKS_CADDY_UPSTREAM?: string;
  SELFCHECKS_SKIP_CADDY_RELOAD?: string;
};

export function normalizeDomain(domain: string) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

export function validateDomain(domain: string) {
  const normalized = normalizeDomain(domain);

  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      normalized,
    )
  ) {
    throw new Error("Enter a valid domain, for example checks.example.com.");
  }

  return normalized;
}

export function validateEmail(email: string) {
  const normalized = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Enter a valid email for Let's Encrypt certificate notices.");
  }

  return normalized;
}

export function getCaddyUpstream(env: CaddyEnv = process.env) {
  return env.SELFCHECKS_CADDY_UPSTREAM || "web:3000";
}

export function getCaddyAdminOrigin(env: CaddyEnv = process.env) {
  return env.SELFCHECKS_CADDY_ADMIN_ORIGIN || "http://0.0.0.0:2019";
}

export function getCaddyAdminOrigins(env: CaddyEnv = process.env) {
  const origins = [getCaddyAdminOrigin(env)];

  if (env.SELFCHECKS_CADDY_ADMIN_URL) {
    origins.push(new URL(env.SELFCHECKS_CADDY_ADMIN_URL).origin);
  } else {
    origins.push("http://caddy:2019");
  }

  return [...new Set(origins)].join(" ");
}

export function generateInitialCaddyfile(env: CaddyEnv = process.env) {
  const upstream = getCaddyUpstream(env);
  const adminOrigins = getCaddyAdminOrigins(env);

  return `{
    admin 0.0.0.0:2019 {
        origins ${adminOrigins}
    }
    auto_https off
}

:80 {
    encode gzip zstd
    reverse_proxy ${upstream}
}
`;
}

export function generateConfiguredCaddyfile({
  caddyEmail,
  domain,
  env = process.env,
}: {
  caddyEmail: string;
  domain: string;
  env?: CaddyEnv;
}) {
  const upstream = getCaddyUpstream(env);
  const adminOrigins = getCaddyAdminOrigins(env);

  return `{
    admin 0.0.0.0:2019 {
        origins ${adminOrigins}
    }
    email ${caddyEmail}
}

(selfchecks_security_headers) {
    header {
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Frame-Options "DENY"
    }
}

${domain} {
    import selfchecks_security_headers
    encode gzip zstd
    reverse_proxy ${upstream}
}

:80 {
    redir https://${domain}{uri} 308
}
`;
}

export function writeCaddyfile(caddyfile: string, env: CaddyEnv = process.env) {
  const caddyConfigPath = env.SELFCHECKS_CADDY_CONFIG_PATH;

  if (!caddyConfigPath) {
    return;
  }

  fs.mkdirSync(path.dirname(caddyConfigPath), { recursive: true });
  fs.writeFileSync(caddyConfigPath, caddyfile, { encoding: "utf8", mode: 0o600 });
}

export async function reloadCaddy(
  caddyfile: string,
  env: CaddyEnv = process.env,
  fetchImpl: typeof fetch = fetch,
) {
  if (env.SELFCHECKS_SKIP_CADDY_RELOAD === "1" || !env.SELFCHECKS_CADDY_ADMIN_URL) {
    return;
  }

  const headers = {
    "Content-Type": "text/caddyfile",
    Origin: getCaddyAdminOrigin(env),
  };

  const response = await fetchImpl(`${env.SELFCHECKS_CADDY_ADMIN_URL}/load`, {
    body: caddyfile,
    headers,
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `Caddy reload failed with ${response.status} ${response.statusText}.`,
    );
  }
}

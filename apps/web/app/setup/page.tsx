import { redirect } from "next/navigation";

import { ServiceMark } from "@/components/service-mark";
import { isRuntimeAdminConfigured, readRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

type SetupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SetupPage({ searchParams }: SetupPageProps) {
  if (isRuntimeAdminConfigured()) {
    redirect("/login");
  }

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const config = readRuntimeConfig();
  const setupTokenRequired = Boolean(process.env.SELFCHECKS_SETUP_TOKEN);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d1117] px-4 py-10 text-slate-100">
      <section className="w-full max-w-xl rounded-md border border-slate-800 bg-[#12171f] p-6 shadow-xl shadow-black/20">
        <div className="mb-6 flex items-start gap-4">
          <ServiceMark className="h-12 w-12 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-emerald-400">
              First launch
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal">
              Configure SelfChecks
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Create the admin account and enter the domain that will receive the
              production TLS certificate.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mb-5 rounded-md border border-red-900/80 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <form action="/api/setup" className="grid gap-4" method="post">
          {setupTokenRequired ? (
            <label className="grid gap-2 text-sm font-medium" htmlFor="setup-token">
              Setup token
              <input
                autoComplete="off"
                className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                id="setup-token"
                name="setupToken"
                required
                type="password"
              />
            </label>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium" htmlFor="setup-login">
              Login
              <input
                autoComplete="username"
                className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                id="setup-login"
                minLength={3}
                name="login"
                required
                type="text"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium" htmlFor="setup-domain">
              Domain
              <input
                className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                defaultValue={config.server.domain}
                id="setup-domain"
                name="domain"
                placeholder="checks.example.com"
                required
                type="text"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium" htmlFor="setup-password">
              Password
              <input
                autoComplete="new-password"
                className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                id="setup-password"
                minLength={8}
                name="password"
                required
                type="password"
              />
            </label>

            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="setup-password-confirm"
            >
              Confirm password
              <input
                autoComplete="new-password"
                className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                id="setup-password-confirm"
                minLength={8}
                name="passwordConfirm"
                required
                type="password"
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-medium" htmlFor="setup-caddy-email">
            Certificate email
            <input
              autoComplete="email"
              className="h-10 rounded-md border border-slate-700 bg-[#0f151d] px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              defaultValue={config.server.caddyEmail}
              id="setup-caddy-email"
              name="caddyEmail"
              placeholder="ops@example.com"
              required
              type="email"
            />
          </label>

          <button
            className="mt-2 inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500"
            type="submit"
          >
            Finish setup
          </button>
        </form>
      </section>
    </main>
  );
}

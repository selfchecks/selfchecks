import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  Folder,
  GitBranch,
  Link2,
  LockKeyhole,
  Play,
  Unplug,
} from "lucide-react";
import type { ReactNode } from "react";
import { ServiceMark } from "@/components/service-mark";

function ConsentShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d1117] px-4 py-10 text-slate-200 [color-scheme:dark] sm:px-8">
      <div className="w-full max-w-4xl">
        <div className="mb-6 flex items-center gap-3 px-1">
          <ServiceMark className="h-9 w-9 rounded-lg" />
          <span className="text-base font-semibold tracking-tight text-slate-100">
            SelfChecks
          </span>
          <span className="h-4 w-px bg-slate-700" />
          <span className="text-sm text-slate-400">MCP connection</span>
        </div>
        {children}
      </div>
    </main>
  );
}

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#151c26]";

export function ConsentView({
  requestId,
  csrf,
  clientName,
  redirectOrigin,
  requestedScopes,
  projects,
}: {
  requestId: string;
  csrf: string;
  clientName: string;
  redirectOrigin: string;
  requestedScopes: string[];
  projects: { slug: string; name: string }[];
}) {
  return (
    <ConsentShell>
      <section className="overflow-hidden rounded-2xl border border-slate-700/70 bg-[#151c26] shadow-2xl shadow-black/30 md:grid md:grid-cols-[0.85fr_1.15fr]">
        <div className="flex flex-col border-b border-slate-700/60 bg-[#111923] p-6 sm:p-8 md:border-b-0 md:border-r">
          <div className="mb-8 flex items-center gap-3" aria-hidden="true">
            <ServiceMark className="h-14 w-14 rounded-xl border border-slate-700/70" />
            <div className="flex flex-1 items-center gap-2 text-slate-600">
              <span className="h-px flex-1 bg-slate-700" />
              <ArrowRight className="h-4 w-4" />
              <span className="h-px flex-1 bg-slate-700" />
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-blue-400/25 bg-blue-400/10 text-xl font-semibold text-blue-300">
              {clientName.trim().charAt(0).toUpperCase() || "M"}
            </div>
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-blue-300">
            Access request
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-slate-50">
            Connect to
            <br className="hidden md:block" /> SelfChecks
          </h1>
          <p className="mt-4 break-words text-sm leading-6 text-slate-400">
            <strong className="font-medium text-slate-200">{clientName}</strong> wants
            to read your monitoring results. Choose which projects and actions it can
            access.
          </p>
          <div className="mt-7 border-t border-slate-700/60 pt-5">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <Link2 className="h-3.5 w-3.5" />
              Return address
            </div>
            <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-200">
              {redirectOrigin}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              The application provides its name. Check the return address before
              allowing access.
            </p>
          </div>
          <div className="mt-7 flex items-start gap-2.5 text-xs leading-5 text-slate-400 md:mt-auto md:pt-10">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <p>
              Access expires in 30 days.
              <br />
              You can revoke it at any time.
            </p>
          </div>
        </div>
        <form action="/oauth/consent/approve" method="post" className="p-6 sm:p-8">
          <input type="hidden" name="request" value={requestId} />
          <input type="hidden" name="csrf" value={csrf} />
          <div className="flex items-center gap-2.5">
            <Folder className="h-4 w-4 text-slate-400" />
            <label
              htmlFor="consent-projects"
              className="text-sm font-semibold text-slate-100"
            >
              Project access
            </label>
          </div>
          <p id="projects-help" className="mt-2 text-xs leading-5 text-slate-400">
            Select the projects this application can access. Hold ⌘ or Ctrl to select
            more than one.
          </p>
          <select
            id="consent-projects"
            name="projects"
            multiple
            required
            defaultValue={projects.length ? [projects[0]!.slug] : ["*"]}
            aria-describedby="projects-help projects-all-help"
            size={Math.min(Math.max(projects.length + 1, 3), 5)}
            className={`mt-3 block w-full rounded-lg border border-slate-700 bg-[#0d141e] p-2 text-sm text-slate-200 ${focus}`}
          >
            <option value="*" className="rounded px-3 py-2">
              All projects · including future projects
            </option>
            {projects.map((project) => (
              <option
                key={project.slug}
                value={project.slug}
                className="rounded px-3 py-2"
              >
                {project.name}
              </option>
            ))}
          </select>
          <p id="projects-all-help" className="mt-2 text-xs leading-5 text-slate-500">
            Choose “All projects” on its own to include future projects.
          </p>
          <fieldset className="mt-7">
            <legend className="text-sm font-semibold text-slate-100">
              Permissions
            </legend>
            <div className="mt-3 divide-y divide-slate-700/70 overflow-hidden rounded-xl border border-slate-700/70">
              <div className="flex items-start gap-3 bg-slate-800/25 p-4">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200">
                    Read monitoring results
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Checks, run history, logs, artifacts and saved AI analysis.
                  </p>
                </div>
                <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <Check className="h-3 w-3" />
                  Required
                </span>
              </div>
              {requestedScopes.includes("run") && (
                <label className="flex cursor-pointer items-start gap-3 p-4 transition-colors hover:bg-slate-800/40 focus-within:bg-slate-800/40">
                  <Play className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-200">
                      Run checks manually
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-400">
                      Allow individual and group runs. Checks may change data in the
                      monitored application.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    name="run"
                    value="yes"
                    className={`mt-0.5 h-4 w-4 shrink-0 accent-blue-500 ${focus}`}
                  />
                </label>
              )}
              {requestedScopes.includes("deploy") && (
                <label className="flex cursor-pointer items-start gap-3 p-4 transition-colors hover:bg-slate-800/40 focus-within:bg-slate-800/40">
                  <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-200">
                      Record application releases
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-400">
                      Add deployment events to release history. This permission does not
                      deploy code.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    name="deploy"
                    value="yes"
                    className={`mt-0.5 h-4 w-4 shrink-0 accent-blue-500 ${focus}`}
                  />
                </label>
              )}
            </div>
          </fieldset>
          <div className="mt-7 grid grid-cols-[0.7fr_1.3fr] gap-3">
            <button
              name="decision"
              value="deny"
              formNoValidate
              className={`rounded-lg border border-slate-600 px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:border-slate-400 hover:bg-slate-800 ${focus}`}
            >
              Deny
            </button>
            <button
              name="decision"
              value="approve"
              className={`inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 ${focus}`}
            >
              Allow access
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-4 text-center text-xs leading-5 text-slate-500">
            Only the selected projects and permissions will be shared.
          </p>
        </form>
      </section>
      <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500">
        <LockKeyhole className="h-3.5 w-3.5" />
        <a
          href="/oauth/connections"
          className="rounded underline-offset-4 hover:text-slate-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          Manage MCP connections
        </a>
      </div>
    </ConsentShell>
  );
}

export function ExpiredConsentView() {
  return (
    <ConsentShell>
      <section className="mx-auto max-w-lg rounded-2xl border border-slate-700/70 bg-[#151c26] p-8 sm:p-10">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/50">
          <Unplug className="h-5 w-5 text-slate-400" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
          Connection expired
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Return to your MCP client and start the connection again to get a new
          authorization link.
        </p>
        <a
          href="/oauth/connections"
          className={`mt-7 inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-3 text-sm font-medium text-slate-200 hover:bg-slate-800 ${focus}`}
        >
          Manage connections
          <ArrowRight className="h-4 w-4" />
        </a>
      </section>
    </ConsentShell>
  );
}

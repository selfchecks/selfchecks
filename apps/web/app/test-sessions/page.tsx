import { FlaskConical } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { ServiceMark } from "@/components/service-mark";
import { getTestSessionsData } from "@/lib/dashboard-data";
import { getDashboardSettingsData } from "@/lib/settings-data";

import { TestSessionsClient } from "./test-sessions-client";

export const dynamic = "force-dynamic";

type TestSessionsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TestSessionsPage({
  searchParams,
}: TestSessionsPageProps) {
  const params = searchParams ? await searchParams : {};
  const data = await getTestSessionsData("default", {
    page: readNumberParam(params.page),
    pageSize: readNumberParam(params.pageSize),
    project: readStringParam(params.project),
    query: readStringParam(params.q),
    sessionName: readStringParam(params.session),
  });
  const settings = await getDashboardSettingsData(data.projectSlug);

  return (
    <main className="min-h-screen bg-[#0d1117] text-slate-200">
      <AppSidebar
        accountLabel={settings.basic.login || "Admin"}
        activeItem="test-sessions"
        projectSlug={data.projectSlug}
      />

      <div className="min-h-screen xl:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#12171f]/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 text-sm text-slate-400">
              <ServiceMark className="h-9 w-9 shrink-0 rounded-md xl:hidden" />
              <span className="hidden truncate sm:inline">
                {settings.basic.login || "Admin"}
              </span>
              <span className="hidden text-slate-600 sm:inline">/</span>
              <span className="inline-flex min-w-0 items-center gap-2 truncate text-slate-200">
                <FlaskConical className="h-4 w-4 shrink-0" />
                Test sessions
              </span>
            </div>
            <div className="hidden text-sm text-slate-500 sm:block">All projects</div>
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <TestSessionsClient initialData={data} />
        </section>
      </div>
    </main>
  );
}

function readStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readNumberParam(value: string | string[] | undefined) {
  const rawValue = readStringParam(value);

  if (!rawValue) {
    return undefined;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  return Number.isSafeInteger(parsedValue) ? parsedValue : undefined;
}

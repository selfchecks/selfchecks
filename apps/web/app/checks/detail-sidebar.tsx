import { Home, Settings2 } from "lucide-react";
import Link from "next/link";

import { ServiceMark } from "@/components/service-mark";

export function DetailSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-slate-800 bg-[#12171f] xl:flex">
      <Link
        className="flex h-16 w-full items-center gap-3 border-b border-slate-800 px-5 text-left hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/40"
        href="/"
      >
        <ServiceMark className="h-9 w-9 shrink-0 rounded-md" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100">
            SelfChecks
          </div>
          <div className="truncate text-xs text-slate-500">Synthetic monitoring</div>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-1">
          <Link
            className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            href="/"
          >
            <Home className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Home</span>
          </Link>
          <Link
            className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            href="/"
          >
            <Settings2 className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Settings</span>
          </Link>
        </div>
      </nav>
    </aside>
  );
}

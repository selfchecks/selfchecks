"use client";

import { History, Home, Settings2, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { ServiceMark } from "@/components/service-mark";
import { cn } from "@/lib/utils";

export type AppSidebarItem = "home" | "journal" | "settings";

type SidebarEntry = {
  href: string;
  icon: LucideIcon;
  id: AppSidebarItem;
  label: string;
};

const sidebarItems: SidebarEntry[] = [
  { href: "/", icon: Home, id: "home", label: "Home" },
  { href: "/journal", icon: History, id: "journal", label: "Journal" },
  { href: "/?view=settings", icon: Settings2, id: "settings", label: "Settings" },
];

export function AppSidebar({
  activeItem,
  onHomeClick,
  onSettingsClick,
}: {
  activeItem?: AppSidebarItem;
  onHomeClick?: () => void;
  onSettingsClick?: () => void;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-slate-800 bg-[#12171f] xl:flex">
      {onHomeClick ? (
        <button
          className="flex h-16 w-full items-center gap-3 border-b border-slate-800 px-5 text-left hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/40"
          onClick={onHomeClick}
          type="button"
        >
          <SidebarBrand />
        </button>
      ) : (
        <Link
          className="flex h-16 w-full items-center gap-3 border-b border-slate-800 px-5 text-left hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/40"
          href="/"
        >
          <SidebarBrand />
        </Link>
      )}

      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-1">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeItem;
            const className = cn(
              "flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium",
              active
                ? "bg-slate-700 text-slate-100"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
            );

            if (item.id === "home" && onHomeClick) {
              return (
                <button
                  aria-current={active ? "page" : undefined}
                  className={className}
                  key={item.id}
                  onClick={onHomeClick}
                  type="button"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              );
            }

            if (item.id === "settings" && onSettingsClick) {
              return (
                <button
                  aria-current={active ? "page" : undefined}
                  className={className}
                  key={item.id}
                  onClick={onSettingsClick}
                  type="button"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              );
            }

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={className}
                href={item.href}
                key={item.id}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

function SidebarBrand() {
  return (
    <>
      <ServiceMark className="h-9 w-9 shrink-0 rounded-md" />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-100">SelfChecks</div>
        <div className="truncate text-xs text-slate-500">Synthetic monitoring</div>
      </div>
    </>
  );
}

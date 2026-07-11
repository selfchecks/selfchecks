"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChartNoAxesColumnIncreasing,
  FlaskConical,
  History,
  Home,
  ListChecks,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { ServiceMark } from "@/components/service-mark";
import { cn } from "@/lib/utils";

export type AppSidebarItem =
  | "home"
  | "journal"
  | "queue"
  | "settings"
  | "test-sessions"
  | "usage";

type SidebarEntry = {
  href: string;
  icon: LucideIcon;
  id: AppSidebarItem;
  label: string;
};

const sidebarItems: SidebarEntry[] = [
  { href: "/", icon: Home, id: "home", label: "Home" },
  { href: "/?view=queue", icon: ListChecks, id: "queue", label: "Queue" },
  { href: "/journal", icon: History, id: "journal", label: "Journal" },
  {
    href: "/test-sessions",
    icon: FlaskConical,
    id: "test-sessions",
    label: "Test sessions",
  },
  {
    href: "/usage",
    icon: ChartNoAxesColumnIncreasing,
    id: "usage",
    label: "Usage",
  },
  { href: "/settings", icon: Settings2, id: "settings", label: "Settings" },
];

const SIDEBAR_STATUS_REFRESH_INTERVAL_MS = 2000;

type SidebarStatus = {
  accountLabel: string;
  queued: number;
  running: number;
};

export function AppSidebar({
  accountLabel = "Admin",
  activeItem,
  initialQueuedCount = 0,
  initialRunningCount = 0,
  onHomeClick,
  onQueueClick,
  projectSlug = "default",
}: {
  accountLabel?: string;
  activeItem?: AppSidebarItem;
  initialQueuedCount?: number;
  initialRunningCount?: number;
  onHomeClick?: () => void;
  onQueueClick?: () => void;
  projectSlug?: string;
}) {
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [status, setStatus] = useState<SidebarStatus>({
    accountLabel,
    queued: initialQueuedCount,
    running: initialRunningCount,
  });

  useEffect(() => {
    setStatus((current) => ({
      ...current,
      accountLabel,
      queued: initialQueuedCount,
      running: initialRunningCount,
    }));
  }, [accountLabel, initialQueuedCount, initialRunningCount]);

  useEffect(() => {
    let cancelled = false;

    async function refreshStatus() {
      try {
        const nextStatus = await fetchSidebarStatus(projectSlug);

        if (!cancelled) {
          setStatus(nextStatus);
        }
      } catch {
        // Keep the last good snapshot visible while the next poll retries.
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshStatus();
    }, SIDEBAR_STATUS_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [projectSlug]);

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !accountMenuRef.current?.contains(event.target)
      ) {
        setAccountMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [accountMenuOpen]);

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

            if (item.id === "queue" && onQueueClick) {
              return (
                <button
                  aria-current={active ? "page" : undefined}
                  className={className}
                  key={item.id}
                  onClick={onQueueClick}
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

      <div className="border-t border-slate-800 p-4">
        <div
          className="relative flex items-center justify-between gap-3"
          ref={accountMenuRef}
        >
          <Link
            aria-label={`Open queue: running ${status.running}, queued ${status.queued}`}
            className="flex h-10 min-w-0 flex-1 items-center rounded-md px-3 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            href="/?view=queue"
          >
            <SidebarQueueIndicators
              queuedCount={status.queued}
              runningCount={status.running}
            />
          </Link>
          <button
            aria-expanded={accountMenuOpen}
            aria-label="Open account menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime-600/70 text-sm font-semibold text-lime-50 hover:bg-lime-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            onClick={() => setAccountMenuOpen((open) => !open)}
            type="button"
          >
            {getInitials(status.accountLabel)}
          </button>

          {accountMenuOpen ? (
            <div className="absolute bottom-12 left-0 right-0 z-50 rounded-md border border-slate-700 bg-[#12171f] p-3 text-sm shadow-xl shadow-black/40">
              <div className="truncate font-medium text-slate-100">
                {status.accountLabel}
              </div>
              <div className="mt-1 text-xs text-slate-500">Signed in locally</div>
              <Link
                className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-slate-300 hover:bg-slate-800"
                href="/settings"
                onClick={() => setAccountMenuOpen(false)}
              >
                <Settings2 className="h-4 w-4 text-slate-500" />
                <span>Settings</span>
              </Link>
              <a
                className="mt-1 block rounded-md px-2 py-2 text-slate-300 hover:bg-slate-800"
                href="/api/auth/signout"
              >
                Sign out
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function SidebarQueueIndicators({
  queuedCount,
  runningCount,
}: {
  queuedCount: number;
  runningCount: number;
}) {
  return (
    <span
      aria-label={`Running ${runningCount}, queued ${queuedCount}`}
      className="flex items-center gap-3 text-sm font-semibold"
      role="status"
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
        <span>{runningCount}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
        <span>{queuedCount}</span>
      </span>
    </span>
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

async function fetchSidebarStatus(projectSlug: string): Promise<SidebarStatus> {
  const response = await fetch(
    `/api/dashboard/status?project=${encodeURIComponent(projectSlug)}`,
    {
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Partial<
    SidebarStatus & { error: string }
  >;

  if (
    !response.ok ||
    typeof payload.accountLabel !== "string" ||
    typeof payload.queued !== "number" ||
    typeof payload.running !== "number"
  ) {
    throw new Error(payload.error ?? "Unable to load sidebar status.");
  }

  return {
    accountLabel: payload.accountLabel,
    queued: payload.queued,
    running: payload.running,
  };
}

function getInitials(value: string) {
  const parts = value
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "AD";
}

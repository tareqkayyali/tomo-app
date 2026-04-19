"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Notifications Hub — shared chrome for the two notification surfaces:
 * Templates (reusable message definitions) and Scheduled (queue of
 * pending + historical push jobs). They live in the same domain but
 * read different tables — one hub, two tabs.
 */

const TABS: { href: string; label: string; hint: string }[] = [
  {
    href: "/admin/notifications/templates",
    label: "Templates",
    hint: "Reusable message templates by category",
  },
  {
    href: "/admin/notifications/scheduled",
    label: "Scheduled",
    hint: "Queued + historical push jobs",
  },
];

export default function NotificationsHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage notification content and delivery — template library and
            the scheduled-job queue.
          </p>
        </div>

        <nav className="border-b">
          <ul className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const isActive =
                pathname === tab.href || pathname.startsWith(tab.href + "/");
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    className={cn(
                      "inline-flex items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                    )}
                    title={tab.hint}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <div>{children}</div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; hint: string }[] = [
  {
    href: "/admin/pd/config",
    label: "Dual Load",
    hint: "Bucketized DLI zone thresholds and recommended actions",
  },
  {
    href: "/admin/pd/config/scheduling",
    label: "Scheduling Rules",
    hint: "Training slot buffers, windows, limits, and priority orders",
  },
];

export default function PdConfigLayout({
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
            Planning Config
          </h1>
          <p className="text-sm text-muted-foreground">
            System-level configuration for the planning engine — Dual Load
            Index thresholds and scheduling rule parameters.
          </p>
        </div>

        <nav className="border-b">
          <ul className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const isActive =
                tab.href === "/admin/pd/config"
                  ? pathname === tab.href
                  : pathname === tab.href ||
                    pathname.startsWith(tab.href + "/");
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

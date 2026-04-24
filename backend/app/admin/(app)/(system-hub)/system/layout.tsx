"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; hint: string }[] = [
  {
    href: "/admin/system/audit",
    label: "Audit Log",
    hint: "Immutable admin action log across all tenants",
  },
  {
    href: "/admin/system/users",
    label: "Users & Roles",
    hint: "User management and role assignment",
  },
  {
    href: "/admin/system/organizations",
    label: "Organizations",
    hint: "Tenant hierarchy — orgs, tiers, and feature entitlements",
  },
  {
    href: "/admin/system/feature-flags",
    label: "Feature Flags",
    hint: "Runtime feature toggles per tenant and user segment",
  },
  {
    href: "/admin/system/config",
    label: "Config",
    hint: "Global system configuration key-value store",
  },
  {
    href: "/admin/system/onboarding",
    label: "Onboarding",
    hint: "Tenant onboarding wizard and setup checklist",
  },
  {
    href: "/admin/system/debug",
    label: "Debug",
    hint: "Internal debug tools — state inspection and test utilities",
  },
];

export default function SystemHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-700">
            System
          </h1>
          <p className="text-sm text-muted-foreground">
            Platform operations — audit, users, organizations, feature flags,
            global config, and debug tooling.
          </p>
        </div>

        <nav className="border-b">
          <ul className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const isActive =
                pathname === tab.href ||
                pathname.startsWith(tab.href + "/");
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    className={cn(
                      "inline-flex items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "border-zinc-600 text-foreground"
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

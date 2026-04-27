"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; hint: string }[] = [
  {
    href: "/admin/pd/instructions",
    label: "Overview",
    hint: "Your command center home",
  },
  {
    href: "/admin/pd/instructions/library",
    label: "Methodology Library",
    hint: "Documents you've written or uploaded",
  },
  {
    href: "/admin/pd/instructions/directives",
    label: "Rules",
    hint: "The rules Tomo follows, grouped by what they control",
  },
  {
    href: "/admin/pd/instructions/snapshots",
    label: "Snapshots",
    hint: "Publish approved rules. Roll back to a previous version any time.",
  },
];

export default function InstructionsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-5">
      <nav className="rounded-md border bg-muted/40 p-1">
        <ul className="flex items-center gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive =
              tab.href === "/admin/pd/instructions"
                ? pathname === tab.href
                : pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className={cn(
                    "inline-flex items-center whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
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

      <div>{children}</div>
    </div>
  );
}

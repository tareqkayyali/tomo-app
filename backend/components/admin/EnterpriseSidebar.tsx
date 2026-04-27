"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import type { OrgRole } from "@/lib/admin/enterpriseAuth";

interface NavItem {
  name: string;
  href: string;
  minRole?: OrgRole;
}

interface NavGroup {
  label: string;
  pillar?: "ai-health" | "pd" | "data" | "system";
  minRole?: OrgRole;
  items: NavItem[];
}

const ROLE_HIERARCHY: Record<OrgRole, number> = {
  super_admin: 0,
  institutional_pd: 1,
  coach: 2,
  analyst: 3,
  athlete: 4,
};

const navigation: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/admin/enterprise" },
    ],
  },
  {
    label: "AI Health Engine",
    pillar: "ai-health",
    minRole: "institutional_pd",
    items: [
      { name: "AI Health", href: "/admin/ai-health" },
    ],
  },
  {
    label: "Performance Director",
    pillar: "pd",
    minRole: "institutional_pd",
    items: [
      { name: "Performance Director", href: "/admin/pd/instructions" },
    ],
  },
  {
    label: "Data Fabric",
    pillar: "data",
    minRole: "coach",
    items: [
      { name: "Data Fabric", href: "/admin/data/programs" },
    ],
  },
  {
    label: "System",
    pillar: "system",
    minRole: "institutional_pd",
    items: [
      { name: "System", href: "/admin/system/audit", minRole: "institutional_pd" },
    ],
  },
];

const PILLAR_ACCENT: Record<string, string> = {
  "ai-health": "text-violet-600",
  pd: "text-blue-600",
  data: "text-emerald-600",
  system: "text-zinc-500",
};

interface EnterpriseSidebarProps {
  userRole: OrgRole;
  tenantName: string;
  tenantTier: string;
}

export function EnterpriseSidebar({
  userRole,
  tenantName,
  tenantTier,
}: EnterpriseSidebarProps) {
  const pathname = usePathname();
  const userLevel = ROLE_HIERARCHY[userRole] ?? 99;

  const filteredNav = navigation
    .filter((group) => {
      const groupLevel = ROLE_HIERARCHY[group.minRole || "athlete"] ?? 99;
      return userLevel <= groupLevel;
    })
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const itemLevel = ROLE_HIERARCHY[item.minRole || group.minRole || "athlete"] ?? 99;
        return userLevel <= itemLevel;
      }),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
            T
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Tomo CMS</span>
            <span className="text-xs text-muted-foreground capitalize">
              {tenantTier === "global" ? "Global Admin" : tenantName}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {filteredNav.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel
              className={group.pillar ? PILLAR_ACCENT[group.pillar] : undefined}
            >
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive =
                    item.href === "/admin/enterprise"
                      ? pathname === item.href
                      : pathname.startsWith(
                          item.href.replace(/\/[^/]+$/, "").replace(/\/$/, "") + "/"
                        ) ||
                        pathname === item.href ||
                        (item.href.includes("/admin/ai-health") && pathname.startsWith("/admin/ai-health")) ||
                        (item.href.includes("/admin/pd/") && pathname.startsWith("/admin/pd/")) ||
                        (item.href.includes("/admin/data/") && pathname.startsWith("/admin/data/")) ||
                        (item.href.includes("/admin/system/") && pathname.startsWith("/admin/system/"));
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={isActive}
                      >
                        {item.name}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div
            className={`h-2 w-2 rounded-full ${
              userRole === "super_admin"
                ? "bg-red-500"
                : userRole === "institutional_pd"
                  ? "bg-blue-500"
                  : userRole === "coach"
                    ? "bg-green-500"
                    : "bg-gray-400"
            }`}
          />
          <span className="capitalize">{userRole.replace("_", " ")}</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

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
  // ─────────────────────────────────────────────────────────────────────────
  // OVERVIEW
  // ─────────────────────────────────────────────────────────────────────────
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/admin/enterprise" },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR 1: AI HEALTH & AUTO-HEAL ENGINE
  // ─────────────────────────────────────────────────────────────────────────
  {
    label: "AI Health Engine",
    pillar: "ai-health",
    minRole: "institutional_pd",
    items: [
      { name: "Health Dashboard", href: "/admin/ai-health" },
      { name: "Auto-Heal Loop", href: "/admin/ai-health/auto-heal" },
      { name: "Chat Quality", href: "/admin/ai-health/quality" },
      { name: "Safety Flags", href: "/admin/ai-health/quality/safety-flags" },
      { name: "Evaluations", href: "/admin/ai-health/evaluations" },
      { name: "Eval Runs", href: "/admin/ai-health/evaluations/runs" },
      { name: "Baselines", href: "/admin/ai-health/evaluations/baselines" },
      { name: "Knowledge Base", href: "/admin/ai-health/knowledge" },
      { name: "AI Operations", href: "/admin/ai-health/ai-ops" },
      { name: "Observability", href: "/admin/ai-health/observability" },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR 2: PERFORMANCE DIRECTOR CONTROL CENTER
  // ─────────────────────────────────────────────────────────────────────────
  {
    label: "Performance Director",
    pillar: "pd",
    minRole: "institutional_pd",
    items: [
      { name: "PD Protocols", href: "/admin/pd/protocols" },
      { name: "Protocol Builder", href: "/admin/pd/protocols/builder" },
      { name: "Protocol Generations", href: "/admin/pd/protocols/generations" },
      { name: "Performance Intelligence", href: "/admin/pd/intelligence" },
      { name: "Planning Hub", href: "/admin/pd/planning" },
      { name: "Cognitive Windows", href: "/admin/pd/cognitive-windows" },
      { name: "Scheduling Rules", href: "/admin/pd/scheduling" },
      { name: "Dual Load", href: "/admin/pd/dual-load" },
      { name: "Athlete Modes", href: "/admin/pd/modes" },
      { name: "Chat Pills", href: "/admin/pd/chat-pills" },
      { name: "Wearables", href: "/admin/pd/wearables" },
      { name: "ACWR Inspector", href: "/admin/pd/acwr" },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PILLAR 3: DATA FABRIC
  // ─────────────────────────────────────────────────────────────────────────
  {
    label: "Data Fabric",
    pillar: "data",
    minRole: "coach",
    items: [
      { name: "Programs", href: "/admin/programs" },
      { name: "Position Matrix", href: "/admin/programs/position-matrix", minRole: "institutional_pd" },
      { name: "Drills", href: "/admin/drills" },
      { name: "Normative Data", href: "/admin/normative-data" },
      { name: "SD Wideners", href: "/admin/normative-wideners", minRole: "institutional_pd" },
      { name: "Progress Metrics", href: "/admin/progress-metrics" },
      { name: "Dashboard Sections", href: "/admin/dashboard-sections" },
      { name: "Content Items", href: "/admin/content-items" },
      { name: "Quotes", href: "/admin/quotes" },
      { name: "Notifications", href: "/admin/notifications/templates", minRole: "institutional_pd" },
      { name: "CV References", href: "/admin/cv-references" },
      { name: "CV Summaries", href: "/admin/cv-ai-summaries" },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SYSTEM
  // ─────────────────────────────────────────────────────────────────────────
  {
    label: "System",
    pillar: "system",
    minRole: "institutional_pd",
    items: [
      { name: "Organizations", href: "/admin/enterprise/organizations", minRole: "super_admin" },
      { name: "Users & Roles", href: "/admin/users", minRole: "super_admin" },
      { name: "Audit Log", href: "/admin/audit" },
      { name: "Feature Flags", href: "/admin/feature-flags", minRole: "super_admin" },
      { name: "System Config", href: "/admin/config" },
      { name: "Safety Gate", href: "/admin/safety-gate", minRole: "super_admin" },
      { name: "Onboarding", href: "/admin/enterprise/onboarding", minRole: "super_admin" },
      { name: "Debug", href: "/admin/debug", minRole: "super_admin" },
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
                    pathname === item.href ||
                    (item.href !== "/admin/enterprise" &&
                      item.href !== "/admin/ai-health" &&
                      pathname.startsWith(item.href + "/")) ||
                    (item.href === "/admin/ai-health" && pathname === item.href);
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

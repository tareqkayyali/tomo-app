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

// New 6-section IA. URLs point at CURRENT page locations; Phase 1b relocates
// pages to match the section prefixes (e.g. /admin/content/drills).
const navigation: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/admin/enterprise" },
    ],
  },
  {
    label: "Content Library",
    minRole: "coach",
    items: [
      { name: "Drills", href: "/admin/drills" },
      { name: "Programs", href: "/admin/programs" },
      { name: "Normative Data", href: "/admin/normative-data" },
      { name: "Quotes", href: "/admin/quotes" },
      { name: "Notification Templates", href: "/admin/notifications/templates", minRole: "institutional_pd" },
      { name: "Scheduled Notifications", href: "/admin/notifications/scheduled", minRole: "institutional_pd" },
    ],
  },
  {
    label: "AI & Knowledge",
    minRole: "institutional_pd",
    items: [
      { name: "RAG Knowledge", href: "/admin/enterprise/knowledge" },
      { name: "Knowledge Editor", href: "/admin/enterprise/knowledge/editor" },
      { name: "Knowledge Graph", href: "/admin/enterprise/knowledge/graph" },
      { name: "Chat Pills", href: "/admin/chat-pills" },
      { name: "Athlete Modes", href: "/admin/modes" },
    ],
  },
  {
    label: "Planning Intelligence",
    minRole: "institutional_pd",
    items: [
      { name: "Planning Protocols", href: "/admin/planning-protocols" },
      { name: "Cognitive Windows", href: "/admin/cognitive-windows" },
      { name: "Scheduling Rules", href: "/admin/scheduling-rules" },
      { name: "PD Protocols", href: "/admin/enterprise/protocols" },
      { name: "Protocol Builder", href: "/admin/enterprise/protocols/builder" },
      { name: "Protocol Inheritance", href: "/admin/enterprise/protocols/inheritance" },
      { name: "Protocol Simulator", href: "/admin/enterprise/protocols/test" },
    ],
  },
  {
    label: "Quality & Safety",
    minRole: "institutional_pd",
    items: [
      { name: "Chat Quality Hub", href: "/admin/enterprise/quality" },
      { name: "Safety Flags", href: "/admin/enterprise/quality/safety-flags" },
      { name: "Judge Disagreements", href: "/admin/enterprise/quality/disagreements" },
      { name: "Drift Alerts", href: "/admin/enterprise/quality/drift" },
      { name: "Shadow Runs", href: "/admin/enterprise/quality/shadow-runs" },
      { name: "Golden Test Set", href: "/admin/enterprise/quality/golden-set" },
      { name: "Eval Dashboard", href: "/admin/enterprise/evaluations" },
      { name: "Safety Gate", href: "/admin/safety-gate" },
    ],
  },
  {
    label: "Operations",
    minRole: "institutional_pd",
    items: [
      { name: "Organizations", href: "/admin/enterprise/organizations", minRole: "super_admin" },
      { name: "Onboarding", href: "/admin/enterprise/onboarding", minRole: "super_admin" },
      { name: "AI Health", href: "/admin/ai-health" },
      { name: "ACWR Inspector", href: "/admin/acwr-inspector" },
      { name: "Performance Intelligence", href: "/admin/performance-intelligence" },
      { name: "Dashboard Sections", href: "/admin/dashboard-sections" },
      { name: "Feature Flags", href: "/admin/feature-flags", minRole: "super_admin" },
      { name: "Debug Console", href: "/admin/debug", minRole: "super_admin" },
    ],
  },
];

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
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/admin/enterprise" &&
                      pathname.startsWith(item.href));
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

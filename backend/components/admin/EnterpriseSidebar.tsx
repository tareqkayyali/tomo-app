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

/**
 * Enterprise CMS sidebar with role-based navigation.
 * Items are filtered based on the user's highest role.
 * Super admins see everything; coaches see read-only modules.
 */

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
    label: "Organization",
    minRole: "super_admin",
    items: [
      { name: "Organizations", href: "/admin/enterprise/organizations" },
      { name: "Onboarding", href: "/admin/enterprise/onboarding" },
    ],
  },
  {
    label: "Knowledge Operations",
    minRole: "institutional_pd",
    items: [
      { name: "Knowledge Base", href: "/admin/enterprise/knowledge" },
      { name: "Knowledge Editor", href: "/admin/enterprise/knowledge/editor" },
      { name: "Knowledge Graph", href: "/admin/enterprise/knowledge/graph" },
    ],
  },
  {
    label: "Performance Director",
    minRole: "institutional_pd",
    items: [
      { name: "Protocols", href: "/admin/enterprise/protocols" },
      { name: "Protocol Builder", href: "/admin/enterprise/protocols/builder" },
      { name: "Protocol Inheritance", href: "/admin/enterprise/protocols/inheritance" },
      { name: "Protocol Simulator", href: "/admin/enterprise/protocols/test" },
    ],
  },
  {
    label: "Training Content",
    minRole: "coach",
    items: [
      { name: "Drills", href: "/admin/drills" },
      { name: "Programs", href: "/admin/programs" },
      { name: "Assessments", href: "/admin/assessments" },
      { name: "Normative Data", href: "/admin/normative-data" },
      { name: "Mastery Pillars", href: "/admin/mastery" },
    ],
  },
  {
    label: "Sport Configuration",
    minRole: "institutional_pd",
    items: [
      { name: "Sports", href: "/admin/sports" },
    ],
  },
  {
    label: "Planning Intelligence",
    minRole: "institutional_pd",
    items: [
      { name: "Athlete Modes", href: "/admin/modes" },
      { name: "Planning Protocols", href: "/admin/planning-protocols" },
      { name: "Cognitive Windows", href: "/admin/cognitive-windows" },
    ],
  },
  {
    label: "AI Evaluation",
    minRole: "institutional_pd",
    items: [
      { name: "Eval Dashboard", href: "/admin/enterprise/evaluations" },
      { name: "Conversation Browser", href: "/admin/enterprise/evaluations/conversations" },
    ],
  },
  {
    label: "AI & Recommendations",
    minRole: "institutional_pd",
    items: [
      { name: "Performance Intelligence", href: "/admin/performance-intelligence" },
      { name: "ACWR Inspector", href: "/admin/acwr-inspector" },
      { name: "AI Health", href: "/admin/ai-health" },
      { name: "Safety Gate", href: "/admin/safety-gate" },
    ],
  },
  {
    label: "Notifications",
    minRole: "institutional_pd",
    items: [
      { name: "Templates", href: "/admin/notifications/templates" },
      { name: "Scheduled Jobs", href: "/admin/notifications/scheduled" },
    ],
  },
  {
    label: "System Diagnostics",
    minRole: "super_admin",
    items: [
      { name: "Debug Console", href: "/admin/debug" },
      { name: "Feature Flags", href: "/admin/feature-flags" },
      { name: "Scheduling Rules", href: "/admin/scheduling-rules" },
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

  // Filter nav groups and items by role
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

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

const navigation = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/admin" },
    ],
  },
  {
    label: "Training Content",
    items: [
      { name: "Drills", href: "/admin/drills" },
      { name: "Programs", href: "/admin/programs" },
      { name: "Programmes", href: "/admin/programmes" },
      { name: "Assessments", href: "/admin/assessments" },
      { name: "Normative Data", href: "/admin/normative-data" },
      { name: "Mastery Pillars", href: "/admin/mastery" },
    ],
  },
  {
    label: "Sport Configuration",
    items: [
      { name: "Sports", href: "/admin/sports" },
    ],
  },
  {
    label: "Content",
    items: [
      { name: "Content Items", href: "/admin/content" },
    ],
  },
  {
    label: "Player CV",
    items: [
      { name: "CV Overview", href: "/admin/cv" },
      { name: "CV Athletes", href: "/admin/cv/athletes" },
      { name: "CV Settings", href: "/admin/cv/settings" },
    ],
  },
  {
    label: "Performance Director",
    items: [
      { name: "Protocols", href: "/admin/protocols" },
      { name: "Program Rules", href: "/admin/program-rules" },
      { name: "Dashboard Signals", href: "/admin/signals" },
      { name: "Test Simulator", href: "/admin/protocols/test" },
      { name: "ACWR Inspector", href: "/admin/acwr-inspector" },
      { name: "Audit Log", href: "/admin/protocols/audit" },
    ],
  },
  {
    label: "Planning Intelligence",
    items: [
      { name: "Athlete Modes", href: "/admin/modes" },
      { name: "Training Categories", href: "/admin/training-categories" },
      { name: "Planning Protocols", href: "/admin/planning-protocols" },
      { name: "Cognitive Windows", href: "/admin/cognitive-windows" },
    ],
  },
  {
    label: "AI & Recommendations",
    items: [
      { name: "Performance Intelligence", href: "/admin/performance-intelligence" },
      { name: "Recommendation Engine", href: "/admin/recommendation-engine" },
      { name: "Intelligence Scores", href: "/admin/intelligence" },
    ],
  },
  {
    label: "Notifications",
    items: [
      { name: "Dashboard", href: "/admin/notifications" },
      { name: "Templates", href: "/admin/notifications/templates" },
      { name: "Scheduled Jobs", href: "/admin/notifications/scheduled" },
      { name: "Push Delivery", href: "/admin/notifications/push" },
      { name: "Management", href: "/admin/notifications/management" },
    ],
  },
  {
    label: "App Design",
    items: [
      { name: "Brand Colors", href: "/admin/design/brand" },
      { name: "Proactive Dashboard", href: "/admin/proactive-dashboard" },
      { name: "DNA Card Tiers", href: "/admin/dna-card" },
      { name: "Feature Flags", href: "/admin/feature-flags" },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-6 py-4">
        <Link href="/admin" className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight">Tomo Admin</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {navigation.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive =
                    item.href === "/admin"
                      ? pathname === "/admin"
                      : pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton
                        isActive={isActive}
                        render={<Link href={item.href} />}
                      >
                        <span>{item.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t px-6 py-3">
        <p className="text-xs text-muted-foreground">Tomo CMS v1.0</p>
      </SidebarFooter>
    </Sidebar>
  );
}

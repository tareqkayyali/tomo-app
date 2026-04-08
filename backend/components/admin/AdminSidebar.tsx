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
      { name: "Dashboard", href: "/admin", icon: "📊" },
    ],
  },
  {
    label: "Training Content",
    items: [
      { name: "Drills", href: "/admin/drills", icon: "⚡" },
      { name: "Programs", href: "/admin/programs", icon: "🏋️" },
      { name: "Programmes", href: "/admin/programmes", icon: "📅" },
      { name: "Assessments", href: "/admin/assessments", icon: "📋" },
      { name: "Normative Data", href: "/admin/normative-data", icon: "📈" },
      { name: "Mastery Pillars", href: "/admin/mastery", icon: "🧬" },
    ],
  },
  {
    label: "Sport Configuration",
    items: [
      { name: "Sports", href: "/admin/sports", icon: "🏆" },
    ],
  },
  {
    label: "Content",
    items: [
      { name: "Content Items", href: "/admin/content", icon: "📝" },
    ],
  },
  {
    label: "Player CV",
    items: [
      { name: "CV Overview", href: "/admin/cv", icon: "📄" },
      { name: "CV Athletes", href: "/admin/cv/athletes", icon: "👤" },
      { name: "CV Settings", href: "/admin/cv/settings", icon: "⚙️" },
    ],
  },
  {
    label: "Performance Director",
    items: [
      { name: "Protocols", href: "/admin/protocols", icon: "🛡️" },
      { name: "Dashboard Signals", href: "/admin/signals", icon: "📡" },
      { name: "Test Simulator", href: "/admin/protocols/test", icon: "🧪" },
      { name: "Audit Log", href: "/admin/protocols/audit", icon: "📜" },
    ],
  },
  {
    label: "AI & Recommendations",
    items: [
      { name: "Performance Intelligence", href: "/admin/performance-intelligence", icon: "🧪" },
      { name: "Recommendation Engine", href: "/admin/recommendation-engine", icon: "🤖" },
      { name: "Intelligence Scores", href: "/admin/intelligence", icon: "🧠" },
    ],
  },
  {
    label: "Notifications",
    items: [
      { name: "Dashboard", href: "/admin/notifications", icon: "🔔" },
      { name: "Templates", href: "/admin/notifications/templates", icon: "📋" },
      { name: "Scheduled Jobs", href: "/admin/notifications/scheduled", icon: "⏰" },
      { name: "Push Delivery", href: "/admin/notifications/push", icon: "📱" },
      { name: "Management", href: "/admin/notifications/management", icon: "⚙️" },
    ],
  },
  {
    label: "App Design",
    items: [
      { name: "Brand Colors", href: "/admin/design/brand", icon: "🎨" },
      { name: "Proactive Dashboard", href: "/admin/proactive-dashboard", icon: "📊" },
      { name: "DNA Card Tiers", href: "/admin/dna-card", icon: "🃏" },
      { name: "Feature Flags", href: "/admin/feature-flags", icon: "🚩" },
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
                        <span>{item.icon}</span>
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

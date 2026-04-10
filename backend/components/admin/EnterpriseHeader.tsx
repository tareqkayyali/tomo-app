"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import type { TenantMembership, OrgRole } from "@/lib/admin/enterpriseAuth";

interface EnterpriseHeaderProps {
  userEmail?: string;
  userRole: OrgRole;
  memberships: TenantMembership[];
  activeTenantId: string;
  activeTenantName: string;
}

/**
 * Enterprise CMS header with org selector and role display.
 * Super admins can switch between organizations.
 */
export function EnterpriseHeader({
  userEmail,
  userRole,
  memberships,
  activeTenantId,
  activeTenantName,
}: EnterpriseHeaderProps) {
  const router = useRouter();
  const supabase = createClient();
  const [showOrgPicker, setShowOrgPicker] = useState(false);

  const institutions = memberships.filter(
    (m) => m.tenant_tier === "institution" || m.tenant_tier === "global"
  );
  const hasMultipleOrgs = institutions.length > 1;

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  function handleOrgSwitch(tenantId: string) {
    // Store selected tenant in cookie for server component access
    document.cookie = `cms_active_tenant=${tenantId};path=/admin;max-age=86400;samesite=strict`;
    setShowOrgPicker(false);
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-6">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />

      {/* Org selector (for multi-org users) */}
      <div className="relative">
        <button
          onClick={() => hasMultipleOrgs && setShowOrgPicker(!showOrgPicker)}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${
            hasMultipleOrgs
              ? "cursor-pointer hover:bg-accent"
              : "cursor-default"
          }`}
        >
          <span className="font-medium">{activeTenantName}</span>
          {hasMultipleOrgs && (
            <svg
              className="h-3 w-3 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          )}
        </button>

        {showOrgPicker && (
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border bg-popover shadow-lg">
            <div className="p-1">
              {institutions.map((m) => (
                <button
                  key={m.tenant_id}
                  onClick={() => handleOrgSwitch(m.tenant_id)}
                  className={`flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent ${
                    m.tenant_id === activeTenantId ? "bg-accent" : ""
                  }`}
                >
                  <span className="flex-1 text-left">{m.tenant_name}</span>
                  <span className="text-xs text-muted-foreground capitalize">
                    {m.role.replace("_", " ")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {userEmail && (
        <span className="text-sm text-muted-foreground">{userEmail}</span>
      )}

      <Separator orientation="vertical" className="h-4" />

      <span className="text-xs text-muted-foreground capitalize">
        {userRole.replace("_", " ")}
      </span>

      <Button variant="ghost" size="sm" onClick={handleSignOut}>
        Sign out
      </Button>
    </header>
  );
}

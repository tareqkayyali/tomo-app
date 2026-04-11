import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SidebarProvider } from "@/components/ui/sidebar";
import { EnterpriseSidebar } from "@/components/admin/EnterpriseSidebar";
import { EnterpriseHeader } from "@/components/admin/EnterpriseHeader";
import { getEnterpriseUser } from "@/lib/admin/enterpriseAuth";

/**
 * Dashboard Layout — Now uses Enterprise CMS layout.
 * Wraps all /admin/* pages (drills, programs, sports, etc.) with the
 * enterprise sidebar and header for a unified CMS experience.
 *
 * Auth: Enterprise RBAC (falls back to is_admin via getEnterpriseUser).
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  // Resolve enterprise user with org memberships
  const enterpriseUser = await getEnterpriseUser(user.id);

  if (!enterpriseUser) {
    redirect("/admin/login?error=no_cms_access");
  }

  // Determine active tenant from cookie or default to primary
  const cookieStore = await cookies();
  const activeTenantCookie = cookieStore.get("cms_active_tenant")?.value;

  let activeTenant = enterpriseUser.memberships.find(
    (m) => m.tenant_id === activeTenantCookie
  );

  if (!activeTenant) {
    activeTenant = enterpriseUser.memberships[0];
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <EnterpriseSidebar
          userRole={enterpriseUser.primaryRole}
          tenantName={activeTenant.tenant_name}
          tenantTier={activeTenant.tenant_tier}
        />
        <div className="flex flex-1 flex-col min-w-0">
          <EnterpriseHeader
            userEmail={user.email}
            userRole={enterpriseUser.primaryRole}
            memberships={enterpriseUser.memberships}
            activeTenantId={activeTenant.tenant_id}
            activeTenantName={activeTenant.tenant_name}
          />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

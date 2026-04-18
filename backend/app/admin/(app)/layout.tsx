import { AdminAppShell } from "@/components/admin/AdminAppShell";

export default async function AuthedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminAppShell>{children}</AdminAppShell>;
}

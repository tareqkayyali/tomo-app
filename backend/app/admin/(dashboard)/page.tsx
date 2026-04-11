import { redirect } from "next/navigation";

/**
 * /admin → Redirect to Enterprise CMS Dashboard
 * The old admin dashboard has been replaced by the enterprise CMS.
 */
export default function AdminRootPage() {
  redirect("/admin/enterprise");
}

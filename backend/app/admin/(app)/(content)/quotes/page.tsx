import { redirect } from "next/navigation";

/**
 * /admin/quotes is now served by the generalized /admin/content-items
 * view with the category filter preset. This redirect preserves every
 * existing bookmark and external link.
 */
export default function QuotesRedirect() {
  redirect("/admin/content-items?category=quotes");
}

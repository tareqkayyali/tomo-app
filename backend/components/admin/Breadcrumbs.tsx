"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, ChevronLeftIcon } from "lucide-react";
import { resolveFrom } from "@/lib/admin/pdNav";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Hierarchical breadcrumbs + smart back chip.
 *
 * Always renders the breadcrumb trail. If `from` resolves to a known target,
 * also renders a "← Back to {label}" chip on the right. For the special
 * `preview` slug there's no canonical href — the chip uses router.back()
 * (snapshot id isn't carried through the from param).
 */
export function Breadcrumbs({
  items,
  from,
}: {
  items: BreadcrumbItem[];
  from?: string | null;
}) {
  const router = useRouter();
  const target = resolveFrom(from);

  return (
    <div className="flex items-center justify-between gap-3 text-xs flex-wrap">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-muted-foreground">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <span key={`${item.label}-${i}`} className="flex items-center gap-1">
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? "font-medium text-foreground" : ""}>{item.label}</span>
              )}
              {!isLast && <ChevronRightIcon className="size-3 shrink-0" />}
            </span>
          );
        })}
      </nav>

      {target && (
        target.href ? (
          <Link
            href={target.href}
            className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-muted hover:text-foreground"
          >
            <ChevronLeftIcon className="size-3" />
            Back to {target.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-muted hover:text-foreground"
          >
            <ChevronLeftIcon className="size-3" />
            Back to {target.label}
          </button>
        )
      )}
    </div>
  );
}

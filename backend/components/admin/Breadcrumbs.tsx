"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, ChevronLeftIcon } from "lucide-react";
import { resolveFrom, withFrom } from "@/lib/admin/pdNav";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Hierarchical breadcrumbs + smart back chip.
 *
 * Always renders the breadcrumb trail. If `from` resolves to a known target,
 * renders a "← Back to {label}" chip. If `trail` is also present, appends
 * ?from=<trail> to the chip's href so the previous hop's back-chip also
 * survives. For the `preview` slug there's no canonical href — chip uses
 * router.back().
 */
export function Breadcrumbs({
  items,
  from,
  trail,
}: {
  items: BreadcrumbItem[];
  from?: string | null;
  trail?: string | null;
}) {
  const router = useRouter();
  const target = resolveFrom(from);
  const targetHref =
    target && target.href && trail ? withFrom(target.href, trail) : target?.href ?? "";

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
            href={targetHref}
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

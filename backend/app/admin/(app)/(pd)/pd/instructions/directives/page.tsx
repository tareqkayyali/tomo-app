"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageGuide } from "@/components/admin/PageGuide";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { withFrom } from "@/lib/admin/pdNav";
import { instructionsHelp } from "@/lib/cms-help/instructions";
import {
  DIRECTIVE_TYPE_LABEL,
  AUDIENCE_LABEL,
  STATUS_LABEL,
  SECTIONS,
} from "../_components/directiveLabels";
import type { DirectiveType } from "@/lib/validation/admin/directiveSchemas";

interface Directive {
  id: string;
  directive_type: DirectiveType;
  audience: "athlete" | "coach" | "parent" | "all";
  sport_scope: string[];
  age_scope: string[];
  status: "proposed" | "approved" | "published" | "retired";
  priority: number;
  source_excerpt: string | null;
  updated_at: string;
}

const STATUS_VARIANT: Record<Directive["status"], "default" | "secondary" | "outline"> = {
  proposed: "secondary",
  approved: "outline",
  published: "default",
  retired: "outline",
};

interface ShadowInfo {
  shadowedIds: Set<string>; // ids of rules that are silently dropped today
  count: number;
}

export default function DirectivesPage() {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | Directive["status"]>("all");
  const [shadowInfo, setShadowInfo] = useState<ShadowInfo>({
    shadowedIds: new Set(),
    count: 0,
  });

  async function load() {
    setLoading(true);
    try {
      const [rulesRes, conflictsRes] = await Promise.all([
        fetch("/api/v1/admin/pd/instructions/directives", { credentials: "include" }),
        fetch("/api/v1/admin/pd/instructions/conflicts", { credentials: "include" }),
      ]);
      if (!rulesRes.ok) throw new Error(await rulesRes.text());
      const data = await rulesRes.json();
      setDirectives(data.directives ?? []);
      if (conflictsRes.ok) {
        const c = await conflictsRes.json();
        const shadows = (c.collisions ?? []).filter(
          (g: { resolution: string }) => g.resolution === "shadow",
        );
        const ids = new Set<string>();
        for (const g of shadows) {
          for (const s of g.shadowed) ids.add(s.id);
        }
        setShadowInfo({ shadowedIds: ids, count: shadows.length });
      }
    } catch (err) {
      toast.error("Couldn't load rules");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return directives;
    return directives.filter((d) => d.status === statusFilter);
  }, [directives, statusFilter]);

  const grouped = useMemo(() => {
    return SECTIONS.map((s) => ({
      ...s,
      items: filtered.filter((d) => s.types.includes(d.directive_type)),
    }));
  }, [filtered]);

  const proposedCount = directives.filter((d) => d.status === "proposed").length;

  async function handleDelete(d: Directive) {
    if (
      !confirm(
        `Delete this rule?\n\n${DIRECTIVE_TYPE_LABEL[d.directive_type]}\n\nIt won't be in any future snapshot. Already-published snapshots keep their copy.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/admin/pd/instructions/directives/${d.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Rule deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete");
    }
  }

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: "Performance Director", href: "/admin/pd/instructions" },
          { label: "Rules" },
        ]}
      />
      <PageGuide {...instructionsHelp.directive_list.page} />

      {shadowInfo.count > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-amber-900">
            <span className="font-semibold">
              {shadowInfo.count} conflict{shadowInfo.count === 1 ? "" : "s"} in your draft set
            </span>{" "}
            — at least one rule is silently shadowed and won&rsquo;t apply.
          </div>
          <Link
            href={withFrom("/admin/pd/instructions/conflicts", "rules")}
            className="text-xs font-medium underline text-amber-900 hover:text-amber-950"
          >
            Review conflicts →
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="proposed">Waiting for review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="published">Live</SelectItem>
              <SelectItem value="retired">Retired</SelectItem>
            </SelectContent>
          </Select>
          {proposedCount > 0 && (
            <Badge variant="secondary">
              {proposedCount} waiting for your review
            </Badge>
          )}
        </div>
        <Link
          href="/admin/pd/instructions/directives/new"
          className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          + Add a rule
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-5">
          {grouped.map((section) => (
            <section key={section.label} className={`rounded-lg border p-4 ${section.accent}`}>
              <header className="mb-3">
                <h3 className="text-sm font-semibold">{section.label}</h3>
                <p className="text-xs text-muted-foreground">{section.description}</p>
              </header>

              {section.items.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No rules in this category yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {section.items.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-start justify-between gap-3 rounded border bg-background p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={withFrom(`/admin/pd/instructions/directives/${d.id}`, "rules")}
                            className="text-sm font-medium hover:underline"
                          >
                            {DIRECTIVE_TYPE_LABEL[d.directive_type]}
                          </Link>
                          <Badge variant={STATUS_VARIANT[d.status]} className="text-xs">
                            {STATUS_LABEL[d.status]}
                          </Badge>
                          {shadowInfo.shadowedIds.has(d.id) && (
                            <Link
                              href={withFrom("/admin/pd/instructions/conflicts", "rules")}
                              className="inline-flex items-center rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100"
                              title="This rule is currently shadowed by another. Click to view."
                            >
                              ⚠ Shadowed
                            </Link>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {AUDIENCE_LABEL[d.audience]}
                            {d.age_scope.length > 0 && ` · ${d.age_scope.join(", ")}`}
                            {d.sport_scope.length > 0 && ` · ${d.sport_scope.join(", ")}`}
                          </span>
                        </div>
                        {d.source_excerpt && (
                          <p className="mt-1 text-xs text-muted-foreground italic line-clamp-2">
                            &ldquo;{d.source_excerpt}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          Priority {d.priority}
                        </span>
                        <Link
                          href={withFrom(`/admin/pd/instructions/directives/${d.id}`, "rules")}
                          className="inline-flex h-7 items-center rounded px-2 text-xs font-medium hover:bg-muted"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(d)}
                          className="inline-flex h-7 items-center rounded px-2 text-xs font-medium text-destructive hover:bg-destructive/10"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

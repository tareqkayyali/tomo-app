"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageGuide } from "@/components/admin/PageGuide";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { instructionsHelp } from "@/lib/cms-help/instructions";

interface Stats {
  documents: { total: number; draft: number; live: number };
  directives: { total: number; proposed: number; approved: number; published: number };
}

const SECTIONS = [
  {
    label: "Coaching Style",
    description: "Personality, tone, and how Tomo replies.",
    types: ["identity", "tone", "response_shape"],
    accent: "bg-blue-50 border-blue-200",
  },
  {
    label: "Safety Rules",
    description: "What Tomo must never recommend, and when to alert a coach.",
    types: ["guardrail_phv", "guardrail_age", "guardrail_load", "safety_gate", "escalation"],
    accent: "bg-red-50 border-red-200",
  },
  {
    label: "Training Methodology",
    description: "What good performance looks like, modes, periodization, scheduling, targets.",
    types: ["performance_model", "threshold", "mode_definition", "planning_policy", "scheduling_policy"],
    accent: "bg-emerald-50 border-emerald-200",
  },
  {
    label: "What Tomo Does & Suggests",
    description: "Routing, recommendations, knowledge, memory.",
    types: ["routing_intent", "routing_classifier", "recommendation_policy", "rag_policy", "memory_policy"],
    accent: "bg-amber-50 border-amber-200",
  },
  {
    label: "Audiences",
    description: "What athletes, coaches, and parents each see.",
    types: ["surface_policy", "coach_dashboard_policy", "parent_report_policy"],
    accent: "bg-violet-50 border-violet-200",
  },
];

export default function InstructionsHubPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/admin/pd/instructions/documents", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { documents: [] }))
        .catch(() => ({ documents: [] })),
      fetch("/api/v1/admin/pd/instructions/directives", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { directives: [] }))
        .catch(() => ({ directives: [] })),
    ]).then(([d, r]) => {
      const docs = d.documents ?? [];
      const dirs = r.directives ?? [];
      setStats({
        documents: {
          total: docs.length,
          draft: docs.filter((x: any) => x.status === "draft").length,
          live: docs.filter((x: any) => x.status === "published").length,
        },
        directives: {
          total: dirs.length,
          proposed: dirs.filter((x: any) => x.status === "proposed").length,
          approved: dirs.filter((x: any) => x.status === "approved").length,
          published: dirs.filter((x: any) => x.status === "published").length,
        },
      });
    });
  }, []);

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Performance Director" }]} />
      <PageGuide {...instructionsHelp.hub.page} />

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/admin/pd/instructions/library"
          className="rounded-lg border bg-background p-5 transition-shadow hover:shadow-sm"
        >
          <div className="text-base font-semibold">Methodology Library</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Write or upload your coaching methodology in plain language.
          </p>
          {stats && (
            <p className="mt-3 text-xs text-muted-foreground">
              {stats.documents.total} document{stats.documents.total === 1 ? "" : "s"}
              {stats.documents.draft > 0 && ` • ${stats.documents.draft} in draft`}
              {stats.documents.live > 0 && ` • ${stats.documents.live} live`}
            </p>
          )}
        </Link>

        <Link
          href="/admin/pd/instructions/directives"
          className="rounded-lg border bg-background p-5 transition-shadow hover:shadow-sm"
        >
          <div className="text-base font-semibold">Rules</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and approve the rules Tomo follows. Grouped by what they control.
          </p>
          {stats && (
            <p className="mt-3 text-xs text-muted-foreground">
              {stats.directives.total} rule{stats.directives.total === 1 ? "" : "s"}
              {stats.directives.proposed > 0 && ` • ${stats.directives.proposed} waiting for review`}
              {stats.directives.approved > 0 && ` • ${stats.directives.approved} approved`}
              {stats.directives.published > 0 && ` • ${stats.directives.published} live`}
            </p>
          )}
        </Link>
      </div>

      {/* Five plain-English categories */}
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Your rules at a glance</h2>
          <p className="text-sm text-muted-foreground">
            Five categories cover everything Tomo does. Click into Rules to manage them.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <Link
              key={s.label}
              href={`/admin/pd/instructions/directives?group=${encodeURIComponent(s.label)}`}
              className={`rounded-lg border p-4 transition-shadow hover:shadow-sm ${s.accent}`}
            >
              <div className="text-sm font-semibold text-foreground">{s.label}</div>
              <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Onboarding hint */}
      <div className="rounded-md border border-dashed bg-muted/30 px-4 py-3">
        <p className="text-sm font-medium">First time here?</p>
        <ol className="mt-1.5 space-y-1 text-sm text-muted-foreground">
          <li>1. Write or upload your coaching methodology in the <strong>Methodology Library</strong>.</li>
          <li>2. (Coming soon) Click <em>Parse</em> to turn your prose into structured rules — or hand-author rules directly.</li>
          <li>3. Review the proposed rules in <strong>Rules</strong> and approve the ones you like.</li>
          <li>4. (Coming next phase) Publish a snapshot to make them live.</li>
        </ol>
        <div className="mt-3">
          <Link
            href="/admin/pd/instructions/library"
            className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            Start with your methodology →
          </Link>
        </div>
      </div>
    </div>
  );
}

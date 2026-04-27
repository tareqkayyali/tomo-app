"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DirectiveForm, type DirectiveDraft } from "../../_components/DirectiveForm";

export default function EditDirectivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [draft, setDraft] = useState<DirectiveDraft | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/admin/pd/instructions/directives/${id}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 404) {
            toast.error("Rule not found");
            router.push("/admin/pd/instructions/directives");
            return null;
          }
          throw new Error(await r.text());
        }
        return r.json();
      })
      .then((data) => {
        if (!active || !data) return;
        setDraft({
          id: data.id,
          document_id: data.document_id,
          directive_type: data.directive_type,
          audience: data.audience,
          sport_scope: data.sport_scope ?? [],
          age_scope: data.age_scope ?? [],
          phv_scope: data.phv_scope ?? [],
          position_scope: data.position_scope ?? [],
          mode_scope: data.mode_scope ?? [],
          priority: data.priority ?? 100,
          payload: data.payload ?? {},
          source_excerpt: data.source_excerpt,
          status: data.status,
        });
      })
      .catch(() => toast.error("Couldn't load this rule"))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, router]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!draft) return null;

  return <DirectiveForm initial={draft} mode="edit" />;
}

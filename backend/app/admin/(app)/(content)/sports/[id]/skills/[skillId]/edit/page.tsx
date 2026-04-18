"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SkillForm } from "@/components/admin/skills/SkillForm";

export default function EditSkillPage() {
  const params = useParams<{ id: string; skillId: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/admin/skills/${params.skillId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.skillId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading skill...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        Skill not found
      </div>
    );
  }

  return (
    <SkillForm sportId={params.id} skillId={params.skillId} initialData={data} />
  );
}

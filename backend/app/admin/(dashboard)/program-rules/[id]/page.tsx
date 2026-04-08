"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProgramRuleForm from "@/components/admin/program-rules/ProgramRuleForm";

export default function EditProgramRulePage() {
  const params = useParams();
  const ruleId = params?.id as string;
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ruleId) return;

    fetch(`/api/v1/admin/program-rules`, { credentials: "include" })
      .then((r) => r.json())
      .then((res) => {
        const rule = (res.rules ?? []).find((r: any) => r.rule_id === ruleId);
        setData(rule ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ruleId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading rule...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20 text-destructive">
        Rule not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Edit Program Rule</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Modify conditions and program guidance.
        </p>
      </div>
      <ProgramRuleForm ruleId={ruleId} initialData={data} />
    </div>
  );
}

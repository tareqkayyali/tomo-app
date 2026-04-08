"use client";

import ProgramRuleForm from "@/components/admin/program-rules/ProgramRuleForm";

export default function NewProgramRulePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create Program Rule</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Define conditions and program guidance for the AI training program engine.
        </p>
      </div>
      <ProgramRuleForm />
    </div>
  );
}

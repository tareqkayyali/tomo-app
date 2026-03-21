"use client";

import { useParams } from "next/navigation";
import { SkillForm } from "@/components/admin/skills/SkillForm";

export default function NewSkillPage() {
  const params = useParams<{ id: string }>();
  return <SkillForm sportId={params.id} />;
}

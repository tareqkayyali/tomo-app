"use client";

import { useParams } from "next/navigation";
import { AttributeForm } from "@/components/admin/attributes/AttributeForm";

export default function NewAttributePage() {
  const params = useParams<{ id: string }>();
  return <AttributeForm sportId={params.id} />;
}

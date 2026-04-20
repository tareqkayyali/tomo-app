"use client";

import { useParams } from "next/navigation";
import { PositionForm } from "@/components/admin/positions/PositionForm";

export default function NewPositionPage() {
  const params = useParams<{ id: string }>();
  return <PositionForm sportId={params.id} />;
}

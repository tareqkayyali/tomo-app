"use client";

import { useParams } from "next/navigation";
import DashboardSectionForm from "@/components/admin/DashboardSectionForm";

export default function EditDashboardSectionPage() {
  const params = useParams();
  const sectionId = params.id as string;

  return <DashboardSectionForm sectionId={sectionId} />;
}

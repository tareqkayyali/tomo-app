"use client";

import { useParams } from "next/navigation";
import ProgressMetricForm from "@/components/admin/ProgressMetricForm";

export default function EditProgressMetricPage() {
  const params = useParams();
  const metricId = params.id as string;
  return <ProgressMetricForm metricId={metricId} />;
}

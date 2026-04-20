"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AssessmentForm } from "@/components/admin/assessments/AssessmentForm";

export default function EditAssessmentPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/admin/assessments/${params.id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading assessment...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        Assessment not found
      </div>
    );
  }

  return <AssessmentForm assessmentId={params.id} initialData={data} />;
}

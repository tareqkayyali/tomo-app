"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageConfigForm } from "@/components/admin/pages/PageConfigForm";

export default function EditPageConfigPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/admin/page-configs/${params.id}`, { credentials: "include" })
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
        Loading page config...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        Page config not found
      </div>
    );
  }

  return <PageConfigForm configId={params.id} initialData={data} />;
}

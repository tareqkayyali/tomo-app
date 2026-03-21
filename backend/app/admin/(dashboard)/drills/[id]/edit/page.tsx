"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DrillForm } from "@/components/admin/drills/DrillForm";

export default function EditDrillPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/admin/drills/${params.id}`, { credentials: "include" })
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
        Loading drill...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        Drill not found
      </div>
    );
  }

  return <DrillForm drillId={params.id} initialData={data} />;
}

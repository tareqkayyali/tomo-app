"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PositionForm } from "@/components/admin/positions/PositionForm";

export default function EditPositionPage() {
  const params = useParams<{ id: string; posId: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/admin/positions/${params.posId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.posId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading position...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        Position not found
      </div>
    );
  }

  return (
    <PositionForm
      sportId={params.id}
      positionId={params.posId}
      initialData={data}
    />
  );
}

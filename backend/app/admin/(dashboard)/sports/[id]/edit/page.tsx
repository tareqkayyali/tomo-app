"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SportForm } from "@/components/admin/sports/SportForm";

export default function EditSportPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/admin/sports/${params.id}`, { credentials: "include" })
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
        Loading sport...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        Sport not found
      </div>
    );
  }

  return <SportForm sportId={params.id} initialData={data} />;
}

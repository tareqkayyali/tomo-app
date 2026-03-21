"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ContentForm } from "@/components/admin/content/ContentForm";

export default function EditContentItemPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/admin/content-items/${params.id}`, {
      credentials: "include",
    })
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
        Loading content item...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        Content item not found
      </div>
    );
  }

  return <ContentForm itemId={params.id} initialData={data} />;
}

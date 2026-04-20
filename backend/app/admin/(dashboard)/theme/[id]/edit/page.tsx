"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ThemeForm } from "@/components/admin/theme/ThemeForm";

export default function EditThemePage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/admin/themes/${params.id}`, { credentials: "include" })
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
        Loading theme...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        Theme not found
      </div>
    );
  }

  return <ThemeForm themeId={params.id} initialData={data} />;
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TrainingCategoryForm } from "@/components/admin/training-categories/TrainingCategoryForm";

export default function EditTrainingCategoryPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/admin/training-categories/${params.id}`, {
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
        Loading category...
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        Category not found
      </div>
    );
  }

  return <TrainingCategoryForm categoryId={params.id} initialData={data} />;
}

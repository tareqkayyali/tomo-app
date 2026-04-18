"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RatingLevelForm } from "@/components/admin/ratings/RatingLevelForm";

export default function EditRatingLevelPage() {
  const params = useParams<{ id: string; levelId: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/admin/rating-levels/${params.levelId}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.levelId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading rating level...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        Rating level not found
      </div>
    );
  }

  return (
    <RatingLevelForm
      sportId={params.id}
      levelId={params.levelId}
      initialData={data}
    />
  );
}

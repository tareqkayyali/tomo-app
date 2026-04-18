"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AttributeForm } from "@/components/admin/attributes/AttributeForm";

export default function EditAttributePage() {
  const params = useParams<{ id: string; attrId: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/admin/attributes/${params.attrId}`, {
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.attrId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading attribute...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        Attribute not found
      </div>
    );
  }

  return (
    <AttributeForm
      sportId={params.id}
      attributeId={params.attrId}
      initialData={data}
    />
  );
}

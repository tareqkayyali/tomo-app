"use client";

import { useEffect, useState, use } from "react";
import { ProgrammeForm } from "@/components/admin/programmes/ProgrammeForm";

export default function EditProgrammePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/admin/programmes/${id}`, { credentials: "include" })
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading programme...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Programme not found
      </div>
    );
  }

  return <ProgrammeForm programmeId={id} initialData={data} />;
}

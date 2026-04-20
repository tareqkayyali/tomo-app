"use client";

import { useEffect, useState, use } from "react";
import { ProgramForm } from "@/components/admin/programs/ProgramForm";

export default function EditProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/admin/programs/${id}`, { credentials: "include" })
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
        Loading program...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Program not found
      </div>
    );
  }

  return <ProgramForm programId={id} initialData={data} />;
}

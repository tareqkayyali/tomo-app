"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ModeForm } from "@/components/admin/modes/ModeForm";
import { toast } from "sonner";

export default function EditModePage() {
  const params = useParams();
  const id = params.id as string;
  const [initialData, setInitialData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMode() {
      setLoading(true);
      const res = await fetch(`/api/v1/admin/modes/${id}`, {
        credentials: "include",
      });
      if (res.ok) {
        const mode = await res.json();
        setInitialData(mode);
      } else {
        setError("Mode not found");
        toast.error("Mode not found");
      }
      setLoading(false);
    }
    fetchMode();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading mode...
      </div>
    );
  }

  if (error || !initialData) {
    return (
      <div className="flex items-center justify-center py-20 text-red-400">
        {error || "Mode not found"}
      </div>
    );
  }

  return <ModeForm modeId={id} initialData={initialData} />;
}

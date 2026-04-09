"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CognitiveWindowForm } from "@/components/admin/cognitive-windows/CognitiveWindowForm";
import { toast } from "sonner";

export default function EditCognitiveWindowPage() {
  const params = useParams();
  const id = params.id as string;
  const [initialData, setInitialData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWindow() {
      setLoading(true);
      const res = await fetch(`/api/v1/admin/cognitive-windows/${id}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setInitialData(data);
      } else if (res.status === 404) {
        setError("Cognitive window not found");
        toast.error("Cognitive window not found");
      } else {
        setError("Failed to load cognitive window");
        toast.error("Failed to load cognitive window");
      }
      setLoading(false);
    }
    fetchWindow();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading cognitive window...
      </div>
    );
  }

  if (error || !initialData) {
    return (
      <div className="flex items-center justify-center py-20 text-red-400">
        {error || "Cognitive window not found"}
      </div>
    );
  }

  return (
    <CognitiveWindowForm
      windowId={id}
      initialData={initialData as any}
    />
  );
}

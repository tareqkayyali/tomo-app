"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PlanningProtocolForm } from "@/components/admin/planning-protocols/PlanningProtocolForm";
import { toast } from "sonner";

export default function EditPlanningProtocolPage() {
  const params = useParams();
  const id = params.id as string;
  const [initialData, setInitialData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProtocol() {
      setLoading(true);
      const res = await fetch(`/api/v1/admin/planning-protocols/${id}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setInitialData(data);
      } else {
        setError("Planning protocol not found");
        toast.error("Planning protocol not found");
      }
      setLoading(false);
    }
    fetchProtocol();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading protocol...
      </div>
    );
  }

  if (error || !initialData) {
    return (
      <div className="flex items-center justify-center py-20 text-red-400">
        {error || "Planning protocol not found"}
      </div>
    );
  }

  return <PlanningProtocolForm protocolId={id} initialData={initialData} />;
}

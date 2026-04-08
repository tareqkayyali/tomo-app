"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ProtocolForm } from "@/components/admin/protocols/ProtocolForm";
import { toast } from "sonner";

export default function EditProtocolPage() {
  const params = useParams();
  const id = params.id as string;
  const [initialData, setInitialData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProtocol() {
      setLoading(true);
      // Fetch all protocols and find the one matching the ID
      const res = await fetch("/api/v1/admin/protocols", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const protocol = (data.protocols ?? []).find(
          (p: Record<string, unknown>) => p.protocol_id === id
        );
        if (protocol) {
          setInitialData(protocol);
        } else {
          setError("Protocol not found");
          toast.error("Protocol not found");
        }
      } else {
        setError("Failed to load protocol");
        toast.error("Failed to load protocol");
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
        {error || "Protocol not found"}
      </div>
    );
  }

  return <ProtocolForm protocolId={id} initialData={initialData} />;
}

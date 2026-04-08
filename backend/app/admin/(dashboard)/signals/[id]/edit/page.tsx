"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SignalForm } from "@/components/admin/signals/SignalForm";
import { toast } from "sonner";

export default function EditSignalPage() {
  const params = useParams();
  const id = params.id as string;
  const [initialData, setInitialData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSignal() {
      setLoading(true);
      const res = await fetch("/api/v1/admin/signals", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const signal = (data.signals ?? []).find(
          (s: Record<string, unknown>) => s.signal_id === id
        );
        if (signal) {
          setInitialData(signal);
        } else {
          setError("Signal not found");
          toast.error("Signal not found");
        }
      } else {
        setError("Failed to load signal");
        toast.error("Failed to load signal");
      }
      setLoading(false);
    }
    fetchSignal();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading signal...
      </div>
    );
  }

  if (error || !initialData) {
    return (
      <div className="flex items-center justify-center py-20 text-red-400">
        {error || "Signal not found"}
      </div>
    );
  }

  return <SignalForm signalId={id} initialData={initialData} />;
}

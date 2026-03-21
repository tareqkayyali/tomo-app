"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface FeatureFlag {
  id: string;
  flag_key: string;
  description: string;
  enabled: boolean;
  sports: string[] | null;
}

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v1/admin/feature-flags", {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setFlags(data.flags || data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  async function handleToggle(flag: FeatureFlag) {
    const res = await fetch(`/api/v1/admin/feature-flags/${flag.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !flag.enabled }),
    });
    if (res.ok) {
      toast.success(`Flag "${flag.flag_key}" ${!flag.enabled ? "enabled" : "disabled"}`);
      fetchFlags();
    } else {
      toast.error("Failed to update flag");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Feature Flags</h1>
          <p className="text-muted-foreground">
            {flags.length} flag{flags.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <Link href="/admin/feature-flags/new">
          <Button>+ New Flag</Button>
        </Link>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flag Key</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Sports</TableHead>
              <TableHead>Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : flags.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No feature flags found
                </TableCell>
              </TableRow>
            ) : (
              flags.map((flag) => (
                <TableRow key={flag.id}>
                  <TableCell className="font-mono font-medium">
                    {flag.flag_key}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-md truncate">
                    {flag.description}
                  </TableCell>
                  <TableCell>
                    {!flag.sports || flag.sports.length === 0 ? (
                      <Badge variant="secondary">All</Badge>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {flag.sports.map((s) => (
                          <Badge key={s} variant="outline" className="text-xs capitalize">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={flag.enabled}
                      onCheckedChange={() => handleToggle(flag)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

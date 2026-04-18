"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { PageGuide } from "@/components/admin/PageGuide";
import { sportsHelp } from "@/lib/cms-help/sports";

interface Sport {
  id: string;
  label: string;
  icon: string;
  color: string;
  sort_order: number;
  available: boolean;
  config: Record<string, unknown>;
}

export default function SportsListPage() {
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSports = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v1/admin/sports", {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setSports(data.sports);
    } else {
      toast.error("Failed to load sports");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSports();
  }, [fetchSports]);

  const configKeys = (config: Record<string, unknown>) => {
    const keys = Object.keys(config);
    if (keys.length === 0) return null;
    return keys.slice(0, 3).join(", ") + (keys.length > 3 ? "..." : "");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sports</h1>
          <PageGuide {...sportsHelp.list.page} />
          <p className="text-muted-foreground">
            {sports.length} sport{sports.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <Link href="/admin/sports/new">
          <Button>+ Add Sport</Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading...
        </div>
      ) : sports.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          No sports found. Create your first sport to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sports.map((sport) => (
            <Link key={sport.id} href={`/admin/sports/${sport.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-white text-lg font-bold shrink-0"
                    style={{ backgroundColor: sport.color }}
                  >
                    {sport.icon ? sport.icon.charAt(0).toUpperCase() : sport.label.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-lg">{sport.label}</CardTitle>
                    <p className="text-xs text-muted-foreground font-mono">
                      {sport.id}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={sport.available ? "default" : "secondary"}>
                      {sport.available ? "Available" : "Unavailable"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Order: {sport.sort_order}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Color:</span>
                    <div
                      className="h-4 w-4 rounded-sm border"
                      style={{ backgroundColor: sport.color }}
                    />
                    <span className="text-xs font-mono text-muted-foreground">
                      {sport.color}
                    </span>
                  </div>

                  {sport.icon && (
                    <div className="text-xs text-muted-foreground">
                      Icon: {sport.icon}
                    </div>
                  )}

                  {configKeys(sport.config) && (
                    <div className="text-xs text-muted-foreground truncate">
                      Config: {configKeys(sport.config)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

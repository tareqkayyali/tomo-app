"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

interface ThemeRow {
  id: string;
  name: string;
  is_active: boolean;
  colors_dark: Record<string, string>;
  colors_light: Record<string, string>;
}

export default function ThemeListPage() {
  const router = useRouter();
  const [themes, setThemes] = useState<ThemeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchThemes = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v1/admin/themes", {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setThemes(data.themes || data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchThemes();
  }, [fetchThemes]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Themes</h1>
          <p className="text-muted-foreground">
            {themes.length} theme{themes.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".json";
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  const json = JSON.parse(text);
                  const res = await fetch("/api/v1/admin/themes", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(json),
                  });
                  if (res.ok) {
                    toast.success("Theme imported");
                    fetchThemes();
                  } else {
                    toast.error("Failed to import theme");
                  }
                };
                input.click();
              } catch {
                toast.error("Invalid JSON file");
              }
            }}
          >
            Import Theme
          </Button>
          <Link href="/admin/theme/new">
            <Button>+ New Theme</Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : themes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No themes found. Create one to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {themes.map((theme) => {
            const accent1 = theme.colors_dark?.accent1 || "#FF6B35";
            const accent2 = theme.colors_dark?.accent2 || "#00D9FF";

            return (
              <Card
                key={theme.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  theme.is_active ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => router.push(`/admin/theme/${theme.id}/edit`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{theme.name}</CardTitle>
                    {theme.is_active && (
                      <Badge className="bg-green-600 text-white">Active</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg border"
                      style={{ backgroundColor: accent1 }}
                      title={`accent1: ${accent1}`}
                    />
                    <div
                      className="w-10 h-10 rounded-lg border"
                      style={{ backgroundColor: accent2 }}
                      title={`accent2: ${accent2}`}
                    />
                    <span className="text-sm text-muted-foreground ml-2">
                      {accent1} / {accent2}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Sport {
  id: string;
  label: string;
  icon: string;
  color: string;
  sort_order: number;
  available: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const HUB_LINKS = [
  {
    title: "Attributes",
    description: "Manage the 6 DNA attributes for this sport",
    href: (id: string) => `/admin/sports/${id}/attributes`,
  },
  {
    title: "Skills",
    description: "Sport-specific skills and drills mapping",
    href: (id: string) => `/admin/sports/${id}/skills`,
    disabled: true,
  },
  {
    title: "Positions",
    description: "Player positions and their attribute weights",
    href: (id: string) => `/admin/sports/${id}/positions`,
    disabled: true,
  },
  {
    title: "Rating Levels",
    description: "Rating level definitions and thresholds",
    href: (id: string) => `/admin/sports/${id}/rating-levels`,
    disabled: true,
  },
];

export default function SportDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [sport, setSport] = useState<Sport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/admin/sports/${params.id}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((d) => {
        setSport(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this sport? This will also delete all related attributes, skills, positions, and rating levels.")) {
      return;
    }
    const res = await fetch(`/api/v1/admin/sports/${params.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Sport deleted");
      router.push("/admin/sports");
    } else {
      toast.error("Failed to delete sport");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!sport) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        Sport not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center text-white text-xl font-bold"
            style={{ backgroundColor: sport.color }}
          >
            {sport.icon ? sport.icon.charAt(0).toUpperCase() : sport.label.charAt(0)}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{sport.label}</h1>
            <p className="text-muted-foreground font-mono text-sm">
              {sport.id}
            </p>
          </div>
          <Badge variant={sport.available ? "default" : "secondary"} className="ml-2">
            {sport.available ? "Available" : "Unavailable"}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/sports/${sport.id}/edit`}>
            <Button variant="outline">Edit Sport</Button>
          </Link>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
          <Link href="/admin/sports">
            <Button variant="ghost">Back to Sports</Button>
          </Link>
        </div>
      </div>

      {/* Info card */}
      <Card>
        <CardHeader>
          <CardTitle>Sport Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Color</span>
              <div className="flex items-center gap-2 mt-1">
                <div
                  className="h-5 w-5 rounded border"
                  style={{ backgroundColor: sport.color }}
                />
                <span className="font-mono">{sport.color}</span>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Icon</span>
              <p className="mt-1 font-mono">{sport.icon || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Sort Order</span>
              <p className="mt-1">{sport.sort_order}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Config Keys</span>
              <p className="mt-1">
                {Object.keys(sport.config).length > 0
                  ? Object.keys(sport.config).join(", ")
                  : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hub links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {HUB_LINKS.map((link) => {
          const content = (
            <Card
              className={`h-full transition-colors ${
                link.disabled
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:border-primary/50 cursor-pointer"
              }`}
            >
              <CardHeader>
                <CardTitle className="text-lg">{link.title}</CardTitle>
                <CardDescription>{link.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {link.disabled ? (
                  <Badge variant="outline">Coming Soon</Badge>
                ) : (
                  <span className="text-sm text-primary">Manage &rarr;</span>
                )}
              </CardContent>
            </Card>
          );

          if (link.disabled) {
            return <div key={link.title}>{content}</div>;
          }

          return (
            <Link key={link.title} href={link.href(sport.id)}>
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

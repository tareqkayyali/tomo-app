"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface NotifTemplate {
  type: string;
  category: string;
  priority: number;
  title: string;
  body: string;
  can_dismiss: boolean;
  enabled: boolean;
  expiry_hours: number | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  critical: "border-red-500/50 bg-red-500/5",
  training: "border-orange-500/50 bg-orange-500/5",
  coaching: "border-green-500/50 bg-green-500/5",
  academic: "border-blue-500/50 bg-blue-500/5",
  triangle: "border-purple-500/50 bg-purple-500/5",
  cv: "border-yellow-500/50 bg-yellow-500/5",
  system: "border-gray-500/50 bg-gray-500/5",
};

const CATEGORY_LABELS: Record<string, string> = {
  critical: "Critical",
  training: "Training",
  coaching: "Coaching",
  academic: "Academic",
  triangle: "Triangle",
  cv: "CV",
  system: "System",
};

export default function NotificationTemplatesPage() {
  const [templates, setTemplates] = useState<NotifTemplate[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<NotifTemplate>>({});

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/notifications/templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
      }
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }

  async function saveTemplate(type: string) {
    try {
      const res = await fetch("/api/v1/admin/notifications/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...editValues }),
      });
      if (res.ok) {
        toast.success(`Template "${type}" updated`);
        setEditingType(null);
        fetchTemplates();
      } else {
        toast.error("Failed to save template");
      }
    } catch {
      toast.error("Failed to save template");
    }
  }

  const filtered = filter === "all"
    ? templates
    : templates.filter((t) => t.category === filter);

  const categories = [...new Set(templates.map((t) => t.category))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notification Templates</h1>
        <p className="text-sm text-muted-foreground">{templates.length} templates</p>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          All
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat}
            size="sm"
            variant={filter === cat ? "default" : "outline"}
            onClick={() => setFilter(cat)}
          >
            {CATEGORY_LABELS[cat] ?? cat}
          </Button>
        ))}
      </div>

      {/* Template Cards */}
      <div className="space-y-3">
        {filtered.map((t) => {
          const isEditing = editingType === t.type;
          return (
            <Card key={t.type} className={`border ${CATEGORY_COLORS[t.category] ?? ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-sm font-mono">{t.type}</CardTitle>
                    <span className="text-xs px-2 py-0.5 rounded bg-muted">
                      P{t.priority}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={t.enabled}
                      disabled={t.category === "critical"}
                      onCheckedChange={async (checked) => {
                        await fetch("/api/v1/admin/notifications/templates", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ type: t.type, enabled: checked }),
                        });
                        fetchTemplates();
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (isEditing) {
                          setEditingType(null);
                        } else {
                          setEditingType(t.type);
                          setEditValues({ title: t.title, body: t.body, priority: t.priority });
                        }
                      }}
                    >
                      {isEditing ? "Cancel" : "Edit"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Title Template</Label>
                      <Input
                        value={editValues.title ?? t.title}
                        onChange={(e) => setEditValues({ ...editValues, title: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Body Template</Label>
                      <textarea
                        className="w-full mt-1 p-2 border rounded bg-background text-sm min-h-[60px]"
                        value={editValues.body ?? t.body}
                        onChange={(e) => setEditValues({ ...editValues, body: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <div>
                        <Label className="text-xs">Priority</Label>
                        <Input
                          type="number"
                          min={1}
                          max={5}
                          value={editValues.priority ?? t.priority}
                          onChange={(e) => setEditValues({ ...editValues, priority: parseInt(e.target.value) })}
                          className="mt-1 w-20"
                        />
                      </div>
                      <Button size="sm" onClick={() => saveTemplate(t.type)}>
                        Save
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Variables: {"{var}"} are interpolated at creation time. Available vars depend on notification type.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.body}</p>
                    <div className="flex gap-2 mt-2">
                      {t.expiry_hours && (
                        <span className="text-xs text-muted-foreground">
                          Expires: {t.expiry_hours}h
                        </span>
                      )}
                      {!t.can_dismiss && (
                        <span className="text-xs text-red-400">Cannot dismiss</span>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

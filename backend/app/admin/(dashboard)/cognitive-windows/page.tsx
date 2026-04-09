"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface CognitiveWindow {
  id: string;
  session_type: string;
  cognitive_state: "enhanced" | "suppressed" | "neutral";
  optimal_study_delay_minutes: number;
  description: string | null;
}

const STATE_COLORS: Record<string, string> = {
  enhanced: "bg-green-500/15 text-green-400 border-green-500/30",
  suppressed: "bg-red-500/15 text-red-400 border-red-500/30",
  neutral: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

export default function CognitiveWindowsPage() {
  const [windows, setWindows] = useState<CognitiveWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editWindow, setEditWindow] = useState<CognitiveWindow | null>(null);
  const [editForm, setEditForm] = useState({
    session_type: "",
    cognitive_state: "neutral" as string,
    optimal_study_delay_minutes: 0,
    description: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchWindows = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v1/admin/cognitive-windows", {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setWindows(data.windows ?? []);
    } else {
      toast.error("Failed to load cognitive windows");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchWindows();
  }, [fetchWindows]);

  async function handleDelete(w: CognitiveWindow) {
    if (!confirm(`Delete cognitive window for "${w.session_type}"? This cannot be undone.`)) return;

    const res = await fetch(`/api/v1/admin/cognitive-windows/${w.id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (res.ok) {
      toast.success(`"${w.session_type}" deleted`);
      fetchWindows();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to delete cognitive window");
    }
  }

  function openEditor(w: CognitiveWindow) {
    setEditWindow(w);
    setEditForm({
      session_type: w.session_type,
      cognitive_state: w.cognitive_state,
      optimal_study_delay_minutes: w.optimal_study_delay_minutes,
      description: w.description || "",
    });
  }

  async function handleSave() {
    if (!editWindow) return;

    setSaving(true);
    const res = await fetch(`/api/v1/admin/cognitive-windows/${editWindow.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_type: editForm.session_type,
        cognitive_state: editForm.cognitive_state,
        optimal_study_delay_minutes: editForm.optimal_study_delay_minutes,
        description: editForm.description || null,
      }),
    });

    if (res.ok) {
      toast.success(`"${editForm.session_type}" updated`);
      setEditWindow(null);
      fetchWindows();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save cognitive window");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cognitive Windows</h1>
          <p className="text-muted-foreground">
            {windows.length} window{windows.length !== 1 ? "s" : ""} configured
          </p>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session Type</TableHead>
              <TableHead>Cognitive State</TableHead>
              <TableHead>Optimal Study Delay</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : windows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No cognitive windows found
                </TableCell>
              </TableRow>
            ) : (
              windows.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.session_type}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATE_COLORS[w.cognitive_state] ?? ""}>
                      {w.cognitive_state}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {w.optimal_study_delay_minutes} min
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {w.description || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditor(w)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => handleDelete(w)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editWindow} onOpenChange={(open) => !open && setEditWindow(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Cognitive Window</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Session Type</Label>
              <Input
                value={editForm.session_type}
                onChange={(e) => setEditForm({ ...editForm, session_type: e.target.value })}
              />
            </div>
            <div>
              <Label>Cognitive State</Label>
              <Select
                value={editForm.cognitive_state ?? '' as string}
                onValueChange={(v) => v && setEditForm({ ...editForm, cognitive_state: v as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enhanced">Enhanced</SelectItem>
                  <SelectItem value="suppressed">Suppressed</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Optimal Study Delay (minutes)</Label>
              <Input
                type="number"
                value={editForm.optimal_study_delay_minutes}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    optimal_study_delay_minutes: parseInt(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditWindow(null)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

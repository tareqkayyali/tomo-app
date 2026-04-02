"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface NotifStats {
  total24h: number;
  total7d: number;
  unreadRate: number;
  actionRate: number;
  dismissRate: number;
  byCategory: Record<string, number>;
}

interface TypeFunnel {
  type: string;
  created: number;
  read: number;
  acted: number;
  dismissed: number;
  expired: number;
  actionRate: number;
}

interface RecentNotif {
  id: string;
  type: string;
  category: string;
  title: string;
  status: string;
  priority: number;
  created_at: string;
  athlete_id: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400",
  training: "bg-orange-500/20 text-orange-400",
  coaching: "bg-green-500/20 text-green-400",
  academic: "bg-blue-500/20 text-blue-400",
  triangle: "bg-purple-500/20 text-purple-400",
  cv: "bg-yellow-500/20 text-yellow-400",
  system: "bg-gray-500/20 text-gray-400",
};

const STATUS_COLORS: Record<string, string> = {
  unread: "bg-blue-500/20 text-blue-400",
  read: "bg-gray-500/20 text-gray-400",
  acted: "bg-green-500/20 text-green-400",
  dismissed: "bg-orange-500/20 text-orange-400",
  expired: "bg-red-500/20 text-red-400",
};

export default function NotificationDashboard() {
  const [stats, setStats] = useState<NotifStats | null>(null);
  const [recent, setRecent] = useState<RecentNotif[]>([]);
  const [funnels, setFunnels] = useState<TypeFunnel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  async function fetchDashboard() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/notifications/dashboard");
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setRecent(data.recent ?? []);
        setFunnels(data.funnels ?? []);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }

  function timeAgo(dateStr: string): string {
    const ms = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 3600);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notification Center</h1>
        <Button variant="outline" onClick={fetchDashboard} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Sent (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.total24h ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Sent (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.total7d ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Unread Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.unreadRate ?? 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Action Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-400">{stats?.actionRate ?? 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Dismiss Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-400">{stats?.dismissRate ?? 0}%</p>
          </CardContent>
        </Card>
      </div>

      {/* By Category */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications by Category (7 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats?.byCategory ?? {}).map(([cat, count]) => (
              <div
                key={cat}
                className={`px-3 py-2 rounded-lg ${CATEGORY_COLORS[cat] ?? "bg-gray-500/20 text-gray-400"}`}
              >
                <span className="text-xs uppercase font-medium">{cat}</span>
                <p className="text-lg font-bold">{count}</p>
              </div>
            ))}
            {Object.keys(stats?.byCategory ?? {}).length === 0 && (
              <p className="text-muted-foreground text-sm">No notifications yet</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Engagement Funnels by Type */}
      {funnels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Engagement Funnels by Type (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4 text-right">Created</th>
                    <th className="py-2 pr-4 text-right">Read</th>
                    <th className="py-2 pr-4 text-right">Acted</th>
                    <th className="py-2 pr-4 text-right">Dismissed</th>
                    <th className="py-2 text-right">Action Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {funnels.map((f) => (
                    <tr key={f.type} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-xs">{f.type}</td>
                      <td className="py-2 pr-4 text-right">{f.created}</td>
                      <td className="py-2 pr-4 text-right">{f.read}</td>
                      <td className="py-2 pr-4 text-right text-green-400">{f.acted}</td>
                      <td className="py-2 pr-4 text-right text-orange-400">{f.dismissed}</td>
                      <td className="py-2 text-right">
                        <span className={f.actionRate >= 50 ? "text-green-400" : f.actionRate >= 20 ? "text-yellow-400" : "text-red-400"}>
                          {f.actionRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Notifications (last 100)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Priority</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((n) => (
                  <tr key={n.id} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-xs">{n.type}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${CATEGORY_COLORS[n.category] ?? ""}`}>
                        {n.category}
                      </span>
                    </td>
                    <td className="py-2 pr-4 max-w-[200px] truncate">{n.title}</td>
                    <td className="py-2 pr-4">P{n.priority}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[n.status] ?? ""}`}>
                        {n.status}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground">{timeAgo(n.created_at)}</td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No notifications found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

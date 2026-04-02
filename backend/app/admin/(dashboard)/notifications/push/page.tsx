"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PushStats {
  registeredDevices: { ios: number; android: number; web: number; total: number };
  pushSentToday: number;
  pushFailedToday: number;
  avgPushPerAthlete: number;
  staleTokens: number;
}

export default function PushDeliveryPage() {
  const [stats, setStats] = useState<PushStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/notifications/push-stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Push Delivery</h1>
        <Button variant="outline" onClick={fetchStats} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {/* Device Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Registered Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.registeredDevices.total ?? 0}</p>
            <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
              <span>iOS: {stats?.registeredDevices.ios ?? 0}</span>
              <span>Android: {stats?.registeredDevices.android ?? 0}</span>
              <span>Web: {stats?.registeredDevices.web ?? 0}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Sent Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-400">{stats?.pushSentToday ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Failed Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-400">{stats?.pushFailedToday ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Stale Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-400">{stats?.staleTokens ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Average Push */}
      <Card>
        <CardHeader>
          <CardTitle>Push Delivery Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm">Average pushes per athlete per day</span>
            <span className="font-mono text-sm">{stats?.avgPushPerAthlete?.toFixed(1) ?? "0.0"}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">Push delivery rate</span>
            <span className="font-mono text-sm">
              {stats && stats.pushSentToday > 0
                ? `${Math.round((stats.pushSentToday / (stats.pushSentToday + stats.pushFailedToday)) * 100)}%`
                : "N/A"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Push notifications are delivered via Expo Push API. Category channels:
            tomo-critical (MAX), tomo-training (HIGH), tomo-coaching (DEFAULT),
            tomo-academic (DEFAULT), tomo-triangle (DEFAULT), tomo-cv (LOW), tomo-system (LOW).
          </p>
        </CardContent>
      </Card>

      {/* Quiet Hours Info */}
      <Card>
        <CardHeader>
          <CardTitle>Quiet Hours</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Default quiet hours: <strong>23:00 - 07:00</strong> (configurable per athlete).
            During quiet hours, non-critical notifications are queued and delivered at quiet_hours_end.
            <strong> LOAD_WARNING_SPIKE</strong> and <strong>INJURY_RISK_FLAG</strong> bypass quiet hours.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

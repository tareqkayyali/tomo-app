"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ScheduledJob {
  name: string;
  description: string;
  schedule: string;
  triggerEndpoint: string;
  status: "active" | "paused";
}

const SCHEDULED_JOBS: ScheduledJob[] = [
  {
    name: "Session Notifications",
    description: "Scan calendar for JOURNAL_PRE_SESSION (60min), SESSION_STARTING_SOON (30min), JOURNAL_POST_SESSION (45min post)",
    schedule: "Every 15 minutes",
    triggerEndpoint: "sessions",
    status: "active",
  },
  {
    name: "Streak at Risk",
    description: "Notify athletes with streak >= 5 who haven't checked in today",
    schedule: "Daily at 21:00",
    triggerEndpoint: "streak_at_risk",
    status: "active",
  },
  {
    name: "Rest Day Reminder",
    description: "Notify athletes on rest days with elevated ACWR (>1.2)",
    schedule: "Daily at 06:00",
    triggerEndpoint: "rest_day",
    status: "active",
  },
  {
    name: "Expire Notifications",
    description: "Mark expired notifications (past expires_at) as expired",
    schedule: "Every hour",
    triggerEndpoint: "",
    status: "active",
  },
  {
    name: "Deliver Queued Push",
    description: "Deliver push notifications queued during quiet hours",
    schedule: "Every 5 minutes",
    triggerEndpoint: "",
    status: "active",
  },
];

export default function ScheduledJobsPage() {
  const [running, setRunning] = useState<string | null>(null);

  async function runTrigger(endpoint: string, name: string) {
    if (!endpoint) {
      toast.info("This job runs via pg_cron, not via API trigger");
      return;
    }
    setRunning(name);
    try {
      const res = await fetch("/api/v1/notifications/triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: endpoint }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${name} completed: ${JSON.stringify(data.results)}`);
      } else {
        toast.error(`${name} failed`);
      }
    } catch {
      toast.error(`${name} failed`);
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Scheduled Jobs</h1>
        <Button
          variant="outline"
          onClick={() => runTrigger("all", "All triggers")}
          disabled={running !== null}
        >
          {running ? "Running..." : "Run All Triggers"}
        </Button>
      </div>

      <div className="space-y-3">
        {SCHEDULED_JOBS.map((job) => (
          <Card key={job.name}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{job.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    job.status === "active"
                      ? "bg-green-500/20 text-green-400"
                      : "bg-gray-500/20 text-gray-400"
                  }`}>
                    {job.status}
                  </span>
                  {job.triggerEndpoint && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={running === job.name}
                      onClick={() => runTrigger(job.triggerEndpoint, job.name)}
                    >
                      {running === job.name ? "Running..." : "Run Now"}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{job.description}</p>
              <p className="text-xs text-muted-foreground mt-1">Schedule: {job.schedule}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">pg_cron Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The "Expire Notifications" and "Deliver Queued Push" jobs run via pg_cron
            directly in the database. They are defined in the migration file
            <code className="mx-1 px-1 bg-muted rounded text-xs">00000000000025_notification_center.sql</code>
            and cannot be manually triggered from this panel.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

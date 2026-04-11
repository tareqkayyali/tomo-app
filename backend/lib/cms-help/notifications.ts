import type { PageHelp } from "./types";

/** Consumed by: notifications/templates/page.tsx, notifications/scheduled/page.tsx */
export const notificationsHelp: Record<string, PageHelp> = {
  templates: {
    page: {
      summary:
        "Notification templates control the exact wording of every automated message the app sends to athletes.",
      details: [
        "This covers check-in reminders, streak celebrations, missed session alerts, readiness warnings, and more.",
        "There are 22 notification types across seven categories. Tomo sends these automatically — no manual sending required.",
        "Edit the templates to match your organisation's tone and language.",
        "A well-worded check-in reminder increases daily engagement. A poorly worded overload warning can cause unnecessary anxiety.",
        "Notifications should match Tomo's voice: direct, supportive, and actionable.",
      ],
      impact:
        'A well-worded check-in reminder increases daily engagement. A poorly worded overload warning ("CRITICAL: ACWR SPIKE DETECTED") can cause unnecessary anxiety. Notifications should match Tomo\'s voice: direct, supportive, and actionable.',
      warning:
        'Do not delete the {{variable}} placeholders in templates — these are replaced with athlete-specific data (name, readiness score, streak count) when the notification is sent. Deleting a placeholder causes the notification to send with the literal text "{{athlete_name}}" instead of the real name.',
      storageKey: "notification-templates",
    },
    fields: {
      title_text: {
        text: "The headline of the push notification — the first line the athlete sees without opening the app. Keep under 50 characters so it displays fully on all device screens.",
        example:
          '"Time to check in" or "Rest day today — good call" or "Streak at risk — quick check-in?"',
      },
      body_text: {
        text: "The full notification message shown when the athlete taps to expand it. Use the {{variable}} placeholders to personalise the message with real data.",
        example:
          '"Hey {{athlete_name}}, your readiness score is {{readiness_score}} today. Based on how you\'re feeling, here\'s what Tomo recommends for your session." Available variables include: {{athlete_name}}, {{readiness_score}}, {{streak_count}}, {{session_type}}, {{coach_name}}.',
      },
      priority: {
        text: "P1 = critical notifications that expand automatically and cannot be dismissed without reading (overload alerts, injury flags). P2 = important but standard notifications (check-in reminders). P3 = lower priority (streak celebrations, tips). Use P1 sparingly — too many P1 notifications causes athletes to disable notifications entirely.",
      },
      expiry_hours: {
        text: "How many hours after delivery this notification remains visible in the athlete's notification centre before it is automatically removed. Set shorter expiry for time-sensitive messages (check-in reminders) and longer for informational messages.",
        example:
          "Check-in reminder: 12 hours (expires end of day). Weekly summary: 168 hours (7 days). Streak at risk: 6 hours.",
      },
      can_dismiss: {
        text: "Whether athletes can dismiss this notification without acting on it. Set to true for most notifications. Set to false only for critical safety or medical alerts where the athlete must acknowledge before continuing.",
      },
    },
  },

  scheduled_jobs: {
    page: {
      summary:
        "This page shows the background jobs that run automatically to deliver notifications on schedule.",
      details: [
        "These run without any manual input — this page is for monitoring their status, not for configuring them.",
        'If a job shows as "paused" or has a failed last-run timestamp, contact Tomo support.',
        "All notification jobs cost zero — no AI is involved in delivery.",
        'If the "Streak at Risk" job stops running, athletes who have not checked in today will not receive their reminder, leading to lower daily engagement.',
        "Monitor this page weekly.",
      ],
      impact:
        'If the "Streak at Risk" job stops running, athletes who have not checked in today will not receive their reminder, leading to lower daily engagement. Monitor this page weekly.',
      warning:
        'Do not pause a job unless instructed by Tomo support. Pausing "Expire Notifications" causes old notifications to accumulate in the database and may slow the app\'s notification centre.',
      storageKey: "scheduled-jobs",
    },
  },
};

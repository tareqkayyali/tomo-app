import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const db = () => supabaseAdmin() as any;

/**
 * POST /api/v1/notifications/seed
 *
 * Creates sample notifications across all 7 categories for the authenticated user.
 * Inserts directly into DB (bypasses group-key dedup) to always create fresh unread notifications.
 * Used for development/testing to verify the notification center UI.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const athleteId = auth.user.id;
  const now = new Date().toISOString();

  const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const notifications = [
    {
      athlete_id: athleteId,
      type: 'LOAD_WARNING_SPIKE',
      category: 'critical',
      priority: 1,
      title: 'ACWR spike \u2014 3 days above 1.5',
      body: 'Your acute:chronic ratio hit 1.62. Day 3 in the danger zone. Today should be rest or light technical only.',
      chips: [{ label: 'ACWR 1.62', style: 'red' }, { label: 'Day 3', style: 'red' }],
      primary_action: { label: 'View load plan', deep_link: 'tomo://own-it?filter=load' },
      secondary_action: { label: 'I understand', deep_link: '', resolves: true },
      expires_at: in48h,
      status: 'unread',
      created_at: now,
      updated_at: now,
    },
    {
      athlete_id: athleteId,
      type: 'STREAK_AT_RISK',
      category: 'training',
      priority: 2,
      title: '12-day streak at risk',
      body: "You haven't checked in today. Takes 10 seconds \u2014 keep the streak alive.",
      chips: [{ label: '12-day streak', style: 'orange' }],
      primary_action: { label: 'Check in now', deep_link: 'tomo://checkin' },
      status: 'unread',
      created_at: now,
      updated_at: now,
    },
    {
      athlete_id: athleteId,
      type: 'REST_DAY_REMINDER',
      category: 'training',
      priority: 2,
      title: 'Rest day \u2014 your ACWR needs this',
      body: "ACWR is at 1.35. Today's rest day is doing real work. No gym, light walking only.",
      chips: [{ label: 'ACWR 1.35', style: 'amber' }],
      primary_action: { label: 'Understood', deep_link: '', resolves: true },
      status: 'unread',
      created_at: now,
      updated_at: now,
    },
    {
      athlete_id: athleteId,
      type: 'PERSONAL_BEST',
      category: 'coaching',
      priority: 3,
      title: 'New personal best \u2014 30m Sprint',
      body: '4.12s \u2014 78th percentile for U17 Football. Your speed block is working.',
      chips: [{ label: '78th percentile', style: 'green' }, { label: 'New PB', style: 'green' }],
      primary_action: { label: 'Add to CV', deep_link: 'tomo://cv?highlight=30m_sprint' },
      secondary_action: { label: 'Share with coach', deep_link: 'tomo://chat?intent=share_pb' },
      status: 'unread',
      created_at: now,
      updated_at: now,
    },
    {
      athlete_id: athleteId,
      type: 'READINESS_TREND_UP',
      category: 'coaching',
      priority: 3,
      title: 'Readiness trending up this week',
      body: 'Your 7-day average is 72 \u2014 up 14 points from last week. Good time to push your next strength session.',
      chips: [{ label: '+14 points', style: 'green' }],
      primary_action: { label: 'View readiness', deep_link: 'tomo://own-it' },
      status: 'unread',
      created_at: now,
      updated_at: now,
    },
    {
      athlete_id: athleteId,
      type: 'EXAM_APPROACHING',
      category: 'academic',
      priority: 2,
      title: 'Mathematics exam in 5 days',
      body: 'Dual-load index projected at 78 this week. Tomo has suggested a reduced training schedule \u2014 review the adjusted plan.',
      chips: [{ label: 'Dual-load 78/100', style: 'amber' }, { label: 'Exam Apr 3', style: 'blue' }],
      primary_action: { label: 'View adjusted plan', deep_link: 'tomo://own-it?filter=academic' },
      status: 'unread',
      created_at: now,
      updated_at: now,
    },
    {
      athlete_id: athleteId,
      type: 'COACH_ASSESSMENT_ADDED',
      category: 'triangle',
      priority: 3,
      title: 'New assessment from Coach Ahmed',
      body: '"Great improvement in positioning and decision-making under pressure"',
      chips: [{ label: 'Technical', style: 'purple' }],
      primary_action: { label: 'View assessment', deep_link: 'tomo://triangle?tab=coach' },
      secondary_action: { label: 'Reply in chat', deep_link: 'tomo://chat?intent=coach_response' },
      status: 'unread',
      created_at: now,
      updated_at: now,
    },
    {
      athlete_id: athleteId,
      type: 'CV_COMPLETENESS_MILESTONE',
      category: 'cv',
      priority: 4,
      title: 'Club CV is 75% complete',
      body: 'Add Competition History to reach the next level and increase scout visibility.',
      chips: [{ label: '75%', style: 'amber' }],
      primary_action: { label: 'Complete CV', deep_link: 'tomo://cv' },
      status: 'unread',
      created_at: now,
      updated_at: now,
    },
    {
      athlete_id: athleteId,
      type: 'SYSTEM_MESSAGE',
      category: 'system',
      priority: 4,
      title: 'Notification Center is live',
      body: 'You now get smart, actionable notifications based on your training, readiness, and schedule.',
      chips: [],
      primary_action: { label: 'Explore', deep_link: 'tomo://own-it' },
      status: 'unread',
      created_at: now,
      updated_at: now,
    },
  ];

  const { data, error } = await db()
    .from('athlete_notifications')
    .insert(notifications)
    .select('id, type, category');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    created: data?.length ?? 0,
    results: data ?? [],
  });
}
